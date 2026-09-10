import { afterEach, describe, expect, it, vi } from "vitest";

import { IntegrationError } from "../errors";
import { createQontoProvider } from "./client";
import { fakeAccount, fakePendingTransaction, fakeTransaction } from "./fixtures";

const credentials = { login: "login-fictif", secretKey: "secret-fictif" };

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function metadata(currentPage: number, nextPage: number | null) {
  return {
    current_page: currentPage,
    next_page: nextPage,
    prev_page: currentPage === 1 ? null : currentPage - 1,
    total_pages: nextPage === null ? currentPage : nextPage,
    total_count: nextPage === null ? 1 : 101,
    per_page: 100,
  };
}

function transactionWindow(overrides: Record<string, unknown> = {}) {
  return {
    accountExternalId: "account-fake",
    page: 1,
    updatedFrom: "2026-03-01T00:00:00.000Z",
    updatedTo: "2026-04-01T00:00:00.000Z",
    initialCreatedFrom: "2025-10-01T00:00:00.000Z",
    timezone: "Europe/Paris",
    ...overrides,
  };
}

function sequenceFetch(responses: Array<Response | Error>) {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    const response = responses.shift();
    if (response instanceof Error) throw response;
    if (response === undefined) throw new Error("Unexpected extra request");
    return response;
  });
  return { fetch, requests };
}

function expectIntegrationCode(error: unknown, code: string) {
  expect(error).toBeInstanceOf(IntegrationError);
  expect((error as IntegrationError).code).toBe(code);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createQontoProvider HTTP contract", () => {
  it("uses the fixed account endpoint, API-key header, and safe GET options", async () => {
    const transport = sequenceFetch([
      jsonResponse({ bank_accounts: [fakeAccount], meta: metadata(1, 2) }),
    ]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    await expect(provider.listAccounts(1)).resolves.toMatchObject({ nextPage: 2 });

    expect(transport.requests).toHaveLength(1);
    const request = transport.requests[0];
    const url = new URL(request?.url ?? "");
    expect(url.origin).toBe("https://thirdparty.qonto.com");
    expect(url.pathname).toBe("/v2/bank_accounts");
    expect(Object.fromEntries(url.searchParams)).toEqual({ page: "1", per_page: "100" });
    expect(request?.init?.method).toBe("GET");
    expect(new Headers(request?.init?.headers).get("Authorization")).toBe(
      "login-fictif:secret-fictif",
    );
    expect(request?.init?.redirect).toBe("error");
    expect(request?.init?.cache).toBe("no-store");
  });

  it("falls back to account page length when metadata is absent", async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) => ({
      ...fakeAccount,
      id: `account-${index}`,
    }));
    const transport = sequenceFetch([
      jsonResponse({ bank_accounts: fullPage }),
      jsonResponse({ bank_accounts: [fakeAccount] }),
    ]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    await expect(provider.listAccounts(3)).resolves.toMatchObject({ nextPage: 4 });
    await expect(provider.listAccounts(4)).resolves.toMatchObject({ nextPage: null });
  });

  it("sends the complete transaction window and uses validated next-page metadata", async () => {
    const transport = sequenceFetch([
      jsonResponse({
        transactions: [fakePendingTransaction],
        meta: metadata(1, 2),
      }),
    ]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    await expect(provider.listTransactions(transactionWindow())).resolves.toMatchObject({
      items: [{ externalId: "transaction-pending-fake", valueDate: null }],
      nextPage: 2,
    });

    const url = new URL(transport.requests[0]?.url ?? "");
    expect(url.pathname).toBe("/v2/transactions");
    expect(url.searchParams.get("bank_account_id")).toBe("account-fake");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("per_page")).toBe("100");
    expect(url.searchParams.getAll("status[]")).toEqual([
      "pending",
      "completed",
      "declined",
      "reversed",
    ]);
    expect(url.searchParams.get("updated_at_from")).toBe("2026-03-01T00:00:00.000Z");
    expect(url.searchParams.get("updated_at_to")).toBe("2026-04-01T00:00:00.000Z");
    expect(url.searchParams.get("created_at_from")).toBe("2025-10-01T00:00:00.000Z");
    expect(url.searchParams.get("sort_by")).toBe("updated_at:asc");
    expect(url.searchParams.has("iban")).toBe(false);
  });

  it("omits the initial creation filter after the first synchronization", async () => {
    const transport = sequenceFetch([
      jsonResponse({ transactions: [], meta: metadata(2, null) }),
    ]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    await expect(
      provider.listTransactions(transactionWindow({ page: 2, initialCreatedFrom: null })),
    ).resolves.toEqual({ items: [], nextPage: null });

    expect(new URL(transport.requests[0]?.url ?? "").searchParams.has("created_at_from")).toBe(
      false,
    );
  });

  it("accepts an empty first transaction page with zero total pages", async () => {
    const transport = sequenceFetch([
      jsonResponse({
        transactions: [],
        meta: {
          current_page: 1,
          next_page: null,
          prev_page: null,
          total_pages: 0,
          total_count: 0,
          per_page: 100,
        },
      }),
    ]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    await expect(provider.listTransactions(transactionWindow())).resolves.toEqual({
      items: [],
      nextPage: null,
    });
  });

  it.each([
    ["current page mismatch", 1, metadata(2, 3)],
    ["repeated next page", 1, metadata(1, 1)],
    ["backward next page", 2, metadata(2, 1)],
  ])("rejects invalid %s metadata", async (_case, requestedPage, meta) => {
    const transport = sequenceFetch([
      jsonResponse({ transactions: [fakeTransaction], meta }),
    ]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    try {
      await provider.listTransactions(transactionWindow({ page: requestedPage }));
      throw new Error("expected invalid metadata rejection");
    } catch (error) {
      expectIntegrationCode(error, "PROVIDER_INVALID_RESPONSE");
    }
  });

  it.each([
    ["malformed JSON", new Response("{private malformed", { status: 200 })],
    ["missing transaction metadata", jsonResponse({ transactions: [fakeTransaction] })],
    [
      "schema failure",
      jsonResponse({
        transactions: [{ ...fakeTransaction, amount_cents: "private invalid cents" }],
        meta: metadata(1, null),
      }),
    ],
  ])("sanitizes %s without retrying", async (_case, response) => {
    const transport = sequenceFetch([response]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    try {
      await provider.listTransactions(transactionWindow());
      throw new Error("expected invalid response rejection");
    } catch (error) {
      expectIntegrationCode(error, "PROVIDER_INVALID_RESPONSE");
      expect((error as Error).message).not.toContain("private");
      expect((error as Error).cause).toBeUndefined();
    }
    expect(transport.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized response body before parsing it", async () => {
    const transport = sequenceFetch([
      new Response("private", {
        status: 200,
        headers: { "content-length": String(5 * 1024 * 1024 + 1) },
      }),
    ]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    await expect(provider.listAccounts(1)).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
    });
  });

  it("bounds an oversized valid JSON body when Content-Length is absent", async () => {
    const oversized = JSON.stringify({
      bank_accounts: [],
      padding: "x".repeat(5 * 1024 * 1024),
    });
    const transport = sequenceFetch([new Response(oversized, { status: 200 })]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    await expect(provider.listAccounts(1)).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
    });
  });

  it.each([
    [{ login: "", secretKey: "secret-fictif" }, "empty login"],
    [{ login: "login:fictif", secretKey: "secret-fictif" }, "ambiguous login"],
    [{ login: "login-fictif", secretKey: "secret\nfictif" }, "header injection"],
  ])("rejects invalid configuration: %s", (config) => {
    expect(() => createQontoProvider(config)).toThrowError(IntegrationError);
  });
});

describe("createQontoProvider retry policy", () => {
  it("recovers from transient responses with exponential waits", async () => {
    const transport = sequenceFetch([
      new Response(null, { status: 503 }),
      jsonResponse({ bank_accounts: [fakeAccount] }),
    ]);
    const waits: number[] = [];
    const provider = createQontoProvider({
      ...credentials,
      fetch: transport.fetch,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
      },
    });

    await expect(provider.listAccounts(1)).resolves.toMatchObject({ nextPage: null });
    expect(transport.fetch).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([500]);
  });

  it.each([
    [429, "PROVIDER_RATE_LIMIT"],
    [408, "PROVIDER_UNAVAILABLE"],
    [500, "PROVIDER_UNAVAILABLE"],
    [502, "PROVIDER_UNAVAILABLE"],
    [503, "PROVIDER_UNAVAILABLE"],
    [504, "PROVIDER_UNAVAILABLE"],
  ])("stops after three attempts for HTTP %i", async (status, code) => {
    const transport = sequenceFetch([
      new Response(null, { status }),
      new Response(null, { status }),
      new Response(null, { status }),
    ]);
    const waits: number[] = [];
    const provider = createQontoProvider({
      ...credentials,
      fetch: transport.fetch,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
      },
    });

    try {
      await provider.listAccounts(1);
      throw new Error("expected retry exhaustion");
    } catch (error) {
      expectIntegrationCode(error, code);
    }
    expect(transport.fetch).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([500, 1_000]);
  });

  it("retries network failures and exposes only the stable unavailable error", async () => {
    const transport = sequenceFetch([
      new Error("private host lookup detail"),
      new Error("private host lookup detail"),
      new Error("private host lookup detail"),
    ]);
    const provider = createQontoProvider({
      ...credentials,
      fetch: transport.fetch,
      sleep: async () => undefined,
    });

    try {
      await provider.listAccounts(1);
      throw new Error("expected retry exhaustion");
    } catch (error) {
      expectIntegrationCode(error, "PROVIDER_UNAVAILABLE");
      expect((error as Error).message).not.toContain("private");
      expect((error as Error).cause).toBeUndefined();
    }
  });

  it.each([401, 403])("does not retry authentication HTTP %i", async (status) => {
    const transport = sequenceFetch([new Response("private auth body", { status })]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    await expect(provider.listAccounts(1)).rejects.toMatchObject({
      code: "PROVIDER_AUTH_EXPIRED",
    });
    expect(transport.fetch).toHaveBeenCalledTimes(1);
  });

  it("respects delta-seconds and HTTP-date Retry-After values", async () => {
    const retryDate = "Tue, 01 Sep 2026 12:00:03 GMT";
    const transport = sequenceFetch([
      new Response(null, { status: 429, headers: { "retry-after": "2" } }),
      new Response(null, { status: 503, headers: { "retry-after": retryDate } }),
      jsonResponse({ bank_accounts: [] }),
    ]);
    const waits: number[] = [];
    const provider = createQontoProvider({
      ...credentials,
      fetch: transport.fetch,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
      },
      now: () => Date.parse("2026-09-01T12:00:00.000Z"),
    });

    await expect(provider.listAccounts(1)).resolves.toEqual({ items: [], nextPage: null });
    expect(waits).toEqual([2_000, 3_000]);
  });

  it("does not retry before a Retry-After longer than five seconds", async () => {
    const transport = sequenceFetch([
      new Response("private rate body", { status: 429, headers: { "retry-after": "6" } }),
    ]);
    const provider = createQontoProvider({
      ...credentials,
      fetch: transport.fetch,
      sleep: async () => {
        throw new Error("must not sleep");
      },
    });

    await expect(provider.listAccounts(1)).rejects.toMatchObject({
      code: "PROVIDER_RATE_LIMIT",
    });
    expect(transport.fetch).toHaveBeenCalledTimes(1);
  });

  it("aborts every unavailable attempt after ten seconds", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("private aborted")));
      }),
    );
    const provider = createQontoProvider({
      ...credentials,
      fetch,
      sleep: async () => undefined,
    });

    const result = expect(provider.listAccounts(1)).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);

    await result;
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
