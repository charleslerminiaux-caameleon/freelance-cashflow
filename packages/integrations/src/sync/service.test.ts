import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  BankingPage,
  BankingProvider,
  NormalizedBankAccount,
  NormalizedBankTransaction,
  TransactionWindow,
} from "../banking";
import { IntegrationError } from "../errors";
import type { BankingSyncStore } from "./contracts";
import { SyncStoreError } from "./contracts";
import { synchronizeBanking } from "./service";
import { createQontoProvider } from "../qonto/client";
import { fakeAccount, fakeTransaction } from "../qonto/fixtures";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

function account(externalId: string): NormalizedBankAccount {
  return {
    externalId,
    name: `Compte fictif ${externalId}`,
    ibanMasked: "FR76••••••••••••••••••••1234",
    currency: "EUR",
    currentBalanceCents: 12_345,
    availableBalanceCents: 12_000,
    status: "active",
    updatedAt: "2026-09-10T08:00:00.000Z",
  };
}

function transaction(externalId: string, accountExternalId: string): NormalizedBankTransaction {
  return {
    externalId,
    accountExternalId,
    currency: "EUR",
    amountCents: 1_250,
    direction: "inflow",
    status: "completed",
    label: `Libellé fictif ${externalId}`,
    counterparty: "Client fictif",
    transactionDate: "2026-09-09",
    valueDate: "2026-09-09",
    updatedAt: "2026-09-10T08:30:00.000Z",
  };
}

class FakeStore implements BankingSyncStore {
  readonly calls: string[] = [];
  readonly stagedAccounts: NormalizedBankAccount[] = [];
  readonly stagedTransactions: NormalizedBankTransaction[] = [];
  readonly failCalls: Array<{ code: string; connectionSucceeded: boolean }> = [];
  visibleAccounts = [account("previous-account")];
  publishedThrough = "2026-08-01T00:00:00.000Z";
  stageAccountError: Error | null = null;
  publishResponses: Array<{ created: number; updated: number } | Error> = [
    { created: 1, updated: 2 },
  ];

  async acquire() {
    this.calls.push("acquire");
    return {
      integrationId: "33333333-3333-4333-8333-333333333333",
      initialCreatedFrom: "2026-03-10",
      initialCreatedFromInstant: "2026-03-09T23:00:00.000Z",
      updatedFrom: "2026-09-01T00:00:00.000Z",
      updatedTo: "2026-09-10T09:00:00.000Z",
    };
  }

  async renew() {
    this.calls.push("renew");
  }

  async stageAccounts(
    _ownerUserId: string,
    _runId: string,
    page: number,
    _nextPage: number | null,
    items: NormalizedBankAccount[],
  ) {
    this.calls.push(`stage-accounts-${page}`);
    if (this.stageAccountError) throw this.stageAccountError;
    this.stagedAccounts.push(...items);
  }

  async stageTransactions(
    _ownerUserId: string,
    _runId: string,
    accountExternalId: string,
    page: number,
    _nextPage: number | null,
    items: NormalizedBankTransaction[],
  ) {
    this.calls.push(`stage-transactions-${accountExternalId}-${page}`);
    this.stagedTransactions.push(...items);
  }

  async publish() {
    this.calls.push("publish");
    const response = this.publishResponses.shift();
    if (response instanceof Error) throw response;
    if (!response) throw new Error("Missing fake publish response");
    this.visibleAccounts = [...this.stagedAccounts];
    this.publishedThrough = "2026-09-10T09:00:00.000Z";
    return response;
  }

  async fail(
    _ownerUserId: string,
    _runId: string,
    code: Parameters<BankingSyncStore["fail"]>[2],
    connectionSucceeded: boolean,
  ) {
    this.calls.push("fail");
    this.failCalls.push({ code, connectionSucceeded });
  }
}

function provider(input: {
  accounts: Record<number, BankingPage<NormalizedBankAccount>>;
  transactions?: Record<string, Record<number, BankingPage<NormalizedBankTransaction>>>;
}): BankingProvider & { accountRequests: number[]; transactionRequests: TransactionWindow[] } {
  const accountRequests: number[] = [];
  const transactionRequests: TransactionWindow[] = [];
  return {
    accountRequests,
    transactionRequests,
    async listAccounts(page) {
      accountRequests.push(page);
      const result = input.accounts[page];
      if (!result) throw new Error(`Missing fake account page ${page}`);
      return result;
    },
    async listTransactions(window) {
      transactionRequests.push(window);
      const result = input.transactions?.[window.accountExternalId]?.[window.page];
      if (!result) throw new Error(`Missing fake transaction page ${window.page}`);
      return result;
    },
  };
}

function synchronize(providerValue: BankingProvider, store = new FakeStore(), now?: () => number) {
  return {
    store,
    result: synchronizeBanking({
      ownerUserId,
      runId,
      timezone: "Europe/Paris",
      provider: providerValue,
      store,
      now,
    }),
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function metadata(currentPage: number, totalPages: number) {
  return {
    current_page: currentPage,
    next_page: currentPage < totalPages ? currentPage + 1 : null,
    prev_page: currentPage === 1 ? null : currentPage - 1,
    total_pages: totalPages,
    total_count: totalPages,
    per_page: 100,
  };
}

describe("synchronizeBanking", () => {
  it("runs the real Qonto adapter through complete account and transaction streams", async () => {
    const responses = [
      jsonResponse({
        bank_accounts: [{ ...fakeAccount, id: "account-a" }],
        meta: metadata(1, 2),
      }),
      jsonResponse({
        bank_accounts: [{ ...fakeAccount, id: "account-b" }],
        meta: metadata(2, 2),
      }),
      jsonResponse({
        transactions: [
          { ...fakeTransaction, transaction_id: "transaction-a", bank_account_id: "account-a" },
        ],
        meta: metadata(1, 1),
      }),
      jsonResponse({
        transactions: [
          { ...fakeTransaction, transaction_id: "transaction-b", bank_account_id: "account-b" },
        ],
        meta: metadata(1, 1),
      }),
    ];
    const urls: URL[] = [];
    const fetch = vi.fn(async (input: string | URL | Request) => {
      urls.push(new URL(String(input)));
      const response = responses.shift();
      if (!response) throw new Error("Unexpected fictitious request");
      return response;
    });
    const bankingProvider = createQontoProvider({
      login: "login-fictif",
      secretKey: "secret-fictif",
      fetch,
    });
    const { result, store } = synchronize(bankingProvider);

    const resultValue = await result;
    expect(urls.map((url) => url.pathname)).toEqual([
      "/v2/bank_accounts",
      "/v2/bank_accounts",
      "/v2/transactions",
      "/v2/transactions",
    ]);
    expect(resultValue).toEqual({ success: true, created: 1, updated: 2 });
    expect(urls.slice(2).map((url) => url.searchParams.get("created_at_from"))).toEqual([
      "2026-03-09T23:00:00.000Z",
      "2026-03-09T23:00:00.000Z",
    ]);
    expect(store.stagedTransactions.map((item) => item.accountExternalId)).toEqual([
      "account-a",
      "account-b",
    ]);
  });

  it("finishes every account page before starting each account transaction stream", async () => {
    const bankingProvider = provider({
      accounts: {
        1: { items: [account("account-a")], nextPage: 2 },
        2: { items: [account("account-b")], nextPage: null },
      },
      transactions: {
        "account-a": {
          1: { items: [transaction("transaction-a1", "account-a")], nextPage: 2 },
          2: { items: [transaction("transaction-a2", "account-a")], nextPage: null },
        },
        "account-b": { 1: { items: [], nextPage: null } },
      },
    });
    const { result, store } = synchronize(bankingProvider);

    await expect(result).resolves.toEqual({ success: true, created: 1, updated: 2 });
    expect(store.calls.filter((call) => call.startsWith("stage"))).toEqual([
      "stage-accounts-1",
      "stage-accounts-2",
      "stage-transactions-account-a-1",
      "stage-transactions-account-a-2",
      "stage-transactions-account-b-1",
    ]);
    expect(bankingProvider.transactionRequests.map((window) => window.initialCreatedFrom)).toEqual([
      "2026-03-09T23:00:00.000Z",
      "2026-03-09T23:00:00.000Z",
      "2026-03-09T23:00:00.000Z",
    ]);
    expect(store.calls.at(-1)).toBe("publish");
  });

  it("publishes an empty complete inventory without transaction requests", async () => {
    const bankingProvider = provider({ accounts: { 1: { items: [], nextPage: null } } });
    const { result, store } = synchronize(bankingProvider);

    await expect(result).resolves.toEqual({ success: true, created: 1, updated: 2 });
    expect(bankingProvider.transactionRequests).toEqual([]);
    expect(store.visibleAccounts).toEqual([]);
  });

  it("does not call the provider when acquisition is locked", async () => {
    const bankingProvider = provider({ accounts: {} });
    const store = new FakeStore();
    store.acquire = vi.fn().mockRejectedValue(new SyncStoreError("SYNC_LOCKED", false));

    await expect(synchronize(bankingProvider, store).result).resolves.toEqual({
      success: false,
      code: "SYNC_LOCKED",
    });
    expect(bankingProvider.accountRequests).toEqual([]);
    expect(store.failCalls).toEqual([]);
  });

  it("stops after a stage failure and leaves the prior publication visible", async () => {
    const bankingProvider = provider({
      accounts: { 1: { items: [account("account-a")], nextPage: 2 } },
    });
    const store = new FakeStore();
    const previousAccounts = [...store.visibleAccounts];
    const previousBound = store.publishedThrough;
    store.stageAccountError = new SyncStoreError("DATABASE_ERROR", false);

    await expect(synchronize(bankingProvider, store).result).resolves.toEqual({
      success: false,
      code: "DATABASE_ERROR",
    });
    expect(bankingProvider.accountRequests).toEqual([1]);
    expect(store.visibleAccounts).toEqual(previousAccounts);
    expect(store.publishedThrough).toBe(previousBound);
    expect(store.failCalls).toEqual([{ code: "DATABASE_ERROR", connectionSucceeded: true }]);
  });

  it("rejects repeated accounts across pages before fetching transactions", async () => {
    const bankingProvider = provider({
      accounts: {
        1: { items: [account("duplicate")], nextPage: 2 },
        2: { items: [account("duplicate")], nextPage: null },
      },
    });
    const { result, store } = synchronize(bankingProvider);

    await expect(result).resolves.toEqual({
      success: false,
      code: "PROVIDER_INVALID_RESPONSE",
    });
    expect(bankingProvider.transactionRequests).toEqual([]);
    expect(store.calls).not.toContain("publish");
  });

  it("rejects a non-progressing page cursor", async () => {
    const bankingProvider = provider({
      accounts: { 1: { items: [account("account-a")], nextPage: 1 } },
    });
    const { result, store } = synchronize(bankingProvider);

    await expect(result).resolves.toEqual({
      success: false,
      code: "PROVIDER_INVALID_RESPONSE",
    });
    expect(store.calls).not.toContain("publish");
  });

  it("stops at the overall deadline before another provider request", async () => {
    const bankingProvider = provider({
      accounts: {
        1: { items: [account("account-a")], nextPage: 2 },
        2: { items: [], nextPage: null },
      },
    });
    let time = 0;
    const slowStore = new FakeStore();
    const stage = slowStore.stageAccounts.bind(slowStore);
    slowStore.stageAccounts = async (...args) => { await stage(...args); time = 120_001; };
    const { result, store } = synchronize(bankingProvider, slowStore, () => time);

    await expect(result).resolves.toEqual({
      success: false,
      code: "PROVIDER_UNAVAILABLE",
    });
    expect(bankingProvider.accountRequests).toEqual([1]);
    expect(store.calls).not.toContain("publish");
  });

  it("does not stage or publish a provider response that finishes beyond the overall deadline", async () => {
    const bankingProvider = provider({
      accounts: { 1: { items: [], nextPage: null } },
    });
    let time = 0;
    const request = bankingProvider.listAccounts.bind(bankingProvider);
    bankingProvider.listAccounts = async (page) => {
      const result = await request(page);
      time = 120_001;
      return result;
    };
    const { result, store } = synchronize(bankingProvider, new FakeStore(), () => time);

    await expect(result).resolves.toEqual({
      success: false,
      code: "PROVIDER_UNAVAILABLE",
    });
    expect(bankingProvider.accountRequests).toEqual([1]);
    expect(store.calls).not.toContain("stage-accounts-1");
    expect(store.calls).not.toContain("publish");
  });

  it("does not start a provider request when lease renewal crosses the overall deadline", async () => {
    const bankingProvider = provider({
      accounts: { 1: { items: [], nextPage: null } },
    });
    const store = new FakeStore();
    let time = 0;
    store.renew = vi.fn(async () => {
      store.calls.push("renew");
      time = 120_001;
    });

    await expect(synchronize(bankingProvider, store, () => time).result).resolves.toEqual({
      success: false,
      code: "PROVIDER_UNAVAILABLE",
    });
    expect(bankingProvider.accountRequests).toEqual([]);
    expect(store.calls).not.toContain("publish");
  });

  it("retries one ambiguous transient publication and returns the stored result", async () => {
    const bankingProvider = provider({ accounts: { 1: { items: [], nextPage: null } } });
    const store = new FakeStore();
    store.publishResponses = [
      new SyncStoreError("DATABASE_ERROR", true),
      { created: 4, updated: 5 },
    ];

    await expect(synchronize(bankingProvider, store).result).resolves.toEqual({
      success: true,
      created: 4,
      updated: 5,
    });
    expect(store.calls.filter((call) => call === "publish")).toHaveLength(2);
    expect(store.failCalls).toEqual([]);
  });

  it("preserves a run after a non-transient publication error without retry or failure closure", async () => {
    const bankingProvider = provider({ accounts: { 1: { items: [], nextPage: null } } });
    const store = new FakeStore();
    store.publishResponses = [new SyncStoreError("DATABASE_ERROR", false)];

    await expect(synchronize(bankingProvider, store).result).resolves.toEqual({
      success: false,
      code: "DATABASE_ERROR",
    });
    expect(store.calls.filter((call) => call === "publish")).toHaveLength(1);
    expect(store.failCalls).toEqual([]);
  });

  it("preserves an ambiguously published run when the bounded retry also fails", async () => {
    const bankingProvider = provider({ accounts: { 1: { items: [], nextPage: null } } });
    const store = new FakeStore();
    store.publishResponses = [
      new SyncStoreError("DATABASE_ERROR", true),
      new SyncStoreError("DATABASE_ERROR", true),
    ];

    await expect(synchronize(bankingProvider, store).result).resolves.toEqual({
      success: false,
      code: "DATABASE_ERROR",
    });
    expect(store.calls.filter((call) => call === "publish")).toHaveLength(2);
    expect(store.failCalls).toEqual([]);
  });

  it("does not turn acknowledged publication into failure when logging throws", async () => {
    const bankingProvider = provider({ accounts: { 1: { items: [], nextPage: null } } });
    const store = new FakeStore();

    await expect(
      synchronizeBanking({
        ownerUserId,
        runId,
        timezone: "Europe/Paris",
        provider: bankingProvider,
        store,
        log: () => {
          throw new Error("synthetic logger outage");
        },
      }),
    ).resolves.toEqual({ success: true, created: 1, updated: 2 });
  });

  it("uses the owner timezone offset at the stored summer date", async () => {
    const bankingProvider = provider({
      accounts: { 1: { items: [account("account-a")], nextPage: null } },
      transactions: { "account-a": { 1: { items: [], nextPage: null } } },
    });
    const store = new FakeStore();
    store.acquire = vi.fn().mockResolvedValue({
      integrationId: "33333333-3333-4333-8333-333333333333",
      initialCreatedFrom: "2026-07-10",
      initialCreatedFromInstant: "2026-07-09T22:00:00.000Z",
      updatedFrom: "2026-09-01T00:00:00.000Z",
      updatedTo: "2026-09-10T09:00:00.000Z",
    });

    await synchronize(bankingProvider, store).result;

    expect(bankingProvider.transactionRequests[0]?.initialCreatedFrom).toBe(
      "2026-07-09T22:00:00.000Z",
    );
  });

  it("uses the first valid owner-timezone instant when local midnight is skipped", async () => {
    const bankingProvider = provider({
      accounts: { 1: { items: [account("account-a")], nextPage: null } },
      transactions: { "account-a": { 1: { items: [], nextPage: null } } },
    });
    const store = new FakeStore();
    store.acquire = vi.fn().mockResolvedValue({
      integrationId: "33333333-3333-4333-8333-333333333333",
      initialCreatedFrom: "2026-03-08",
      initialCreatedFromInstant: "2026-03-08T05:00:00.000Z",
      updatedFrom: "2026-09-01T00:00:00.000Z",
      updatedTo: "2026-09-10T09:00:00.000Z",
    });

    const result = await synchronizeBanking({
      ownerUserId,
      runId,
      timezone: "America/Havana",
      provider: bankingProvider,
      store,
    });

    expect(result).toEqual({ success: true, created: 1, updated: 2 });
    expect(bankingProvider.transactionRequests[0]?.initialCreatedFrom).toBe(
      "2026-03-08T05:00:00.000Z",
    );
  });

  it("maps unknown provider failures to a stable unavailable result without raw errors", async () => {
    const bankingProvider: BankingProvider = {
      async listAccounts() {
        throw new Error("fictitious-private-canary");
      },
      async listTransactions() {
        throw new IntegrationError("PROVIDER_INVALID_RESPONSE");
      },
    };
    const { result, store } = synchronize(bankingProvider);

    await expect(result).resolves.toEqual({
      success: false,
      code: "PROVIDER_UNAVAILABLE",
    });
    expect(store.failCalls).toEqual([
      { code: "PROVIDER_UNAVAILABLE", connectionSucceeded: false },
    ]);
  });
});


afterEach(() => vi.useRealTimers());

describe("overall cancellation", () => {
  it.each(["acquire", "renew", "stageAccounts", "stageTransactions", "publish", "recovery", "fail"] as const)(
    "settles a pending %s at 120 seconds and never continues after late settlement", async (phase) => {
      vi.useFakeTimers();
      const store = new FakeStore();
      const bankingProvider = provider({
        accounts: { 1: { items: [account("a")], nextPage: null } },
        transactions: { a: { 1: { items: [], nextPage: null } } },
      });
      let release!: (value: never) => void;
      const pending = new Promise<never>(resolve => { release = resolve; });
      let signal: AbortSignal | undefined;
      const stuck = (...args: unknown[]) => { signal = args.at(-1) as AbortSignal; return pending; };
      if (phase === "recovery") {
        store.publish = vi.fn().mockRejectedValueOnce(new SyncStoreError("DATABASE_ERROR", true)).mockImplementation(stuck);
      } else {
        store[phase] = vi.fn(stuck);
      }
      if (phase === "fail") bankingProvider.listAccounts = async () => { throw new IntegrationError("PROVIDER_AUTH_EXPIRED"); };
      let settled: unknown;
      const result = synchronize(bankingProvider, store).result.then(value => { settled = value; });
      await vi.advanceTimersByTimeAsync(119_999);
      expect(settled).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toEqual({ success: false, code: phase === "publish" || phase === "recovery" ? "DATABASE_ERROR" : phase === "fail" ? "PROVIDER_AUTH_EXPIRED" : "PROVIDER_UNAVAILABLE" });
      expect(signal?.aborted).toBe(true);
      const calls = [...store.calls];
      const requests = [...bankingProvider.accountRequests];
      release({ created: 7, updated: 8 } as never);
      await vi.advanceTimersByTimeAsync(0);
      await result;
      expect(store.calls).toEqual(calls);
      expect(bankingProvider.accountRequests).toEqual(requests);
      expect(store.failCalls).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(["fetch", "retry"])("cancels near-deadline Qonto %s without a later request or publication", async (phase) => {
    vi.useFakeTimers();
    const store = new FakeStore();
    const acquire = store.acquire.bind(store);
    store.acquire = () => new Promise(resolve => setTimeout(() => { void acquire().then(resolve); }, 119_000));
    const signals: AbortSignal[] = [];
    const fetch = vi.fn((_url: unknown, init?: RequestInit) => {
      signals.push(init!.signal!);
      return phase === "fetch" ? new Promise<Response>(() => {}) : Promise.resolve(new Response(null, { status: 429, headers: { "retry-after": "5" } }));
    });
    const bankingProvider = createQontoProvider({ login: "synthetic", secretKey: "synthetic", fetch });
    let settled: unknown;
    void synchronize(bankingProvider, store).result.then(value => { settled = value; });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(settled).toEqual({ success: false, code: "PROVIDER_UNAVAILABLE" });
    expect(signals).toHaveLength(1);
    expect(signals[0]!.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.calls).not.toContain("publish");
    expect(store.stagedAccounts).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps an acknowledged receipt even if the injected clock crosses the budget during publication", async () => {
    const store = new FakeStore();
    let time = 0;
    store.publish = async () => { time = 120_001; return { created: 7, updated: 8 }; };
    expect(await synchronize(provider({ accounts: { 1: { items: [], nextPage: null } } }), store, () => time).result)
      .toEqual({ success: true, created: 7, updated: 8 });
    expect(store.failCalls).toEqual([]);
  });
});


it("uses monotonic elapsed time when the wall clock jumps", async () => {
  vi.useFakeTimers();
  const store = new FakeStore();
  store.acquire = () => new Promise(() => {});
  let settled: unknown;
  void synchronize(provider({ accounts: {} }), store).result.then(value => { settled = value; });
  vi.setSystemTime(new Date("2040-01-01T00:00:00Z"));
  await vi.advanceTimersByTimeAsync(119_999);
  expect(settled).toBeUndefined();
  await vi.advanceTimersByTimeAsync(1);
  expect(settled).toEqual({ success: false, code: "PROVIDER_UNAVAILABLE" });
});

it("gives late failure cleanup only the remainder of the original budget", async () => {
  vi.useFakeTimers();
  const store = new FakeStore();
  const bankingProvider = provider({ accounts: {} });
  bankingProvider.listAccounts = () => new Promise((_resolve, reject) => {
    setTimeout(() => reject(new IntegrationError("PROVIDER_AUTH_EXPIRED")), 119_000);
  });
  store.fail = () => new Promise(() => {});
  let settled: unknown;
  void synchronize(bankingProvider, store).result.then(value => { settled = value; });
  await vi.advanceTimersByTimeAsync(119_999);
  expect(settled).toBeUndefined();
  await vi.advanceTimersByTimeAsync(1);
  expect(settled).toEqual({ success: false, code: "PROVIDER_AUTH_EXPIRED" });
});

it("never starts recovery or failure closure after an uncertain publication crosses the deadline", async () => {
  const store = new FakeStore();
  let time = 0;
  store.publish = vi.fn(async () => { time = 120_001; throw new SyncStoreError("DATABASE_ERROR", true); });
  const result = await synchronize(provider({ accounts: { 1: { items: [], nextPage: null } } }), store, () => time).result;
  expect(result).toEqual({ success: false, code: "DATABASE_ERROR" });
  expect(store.publish).toHaveBeenCalledTimes(1);
  expect(store.failCalls).toEqual([]);
});


it("returns a neutral admission skip before any provider or publication effects", async () => {
  const store = new FakeStore();
  const automaticStore: BankingSyncStore = { ...store, acquire: async () => null, renew: vi.fn(), stageAccounts: vi.fn(), stageTransactions: vi.fn(), publish: vi.fn(), fail: vi.fn() };
  const provider = { listAccounts: vi.fn(), listTransactions: vi.fn() };
  const log = vi.fn();
  expect(await synchronizeBanking({ ownerUserId, runId, timezone: "Europe/Paris", store: automaticStore, provider, log })).toEqual({ success: true, skipped: true });
  expect(provider.listAccounts).not.toHaveBeenCalled();
  expect(automaticStore.publish).not.toHaveBeenCalled();
  expect(automaticStore.fail).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalledWith(expect.objectContaining({ event: "sync_succeeded" }));
});
