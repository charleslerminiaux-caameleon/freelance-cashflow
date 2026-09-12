// @vitest-environment node
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SyncStoreError } from "@fc/integrations/server";

import { createBankingSyncStore } from "./sync-repository";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

function clientWithRpc(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("createBankingSyncStore", () => {
  it("parses acquisition data and normalizes database instants", async () => {
    const { client, rpc } = clientWithRpc({
      data: {
        integration_id: "33333333-3333-4333-8333-333333333333",
        run_id: runId,
        initial_created_from: "2026-03-10",
        initial_created_from_instant: "2026-03-09T23:00:00+00:00",
        updated_from: "2026-09-01T10:00:00+00:00",
        updated_to: "2026-09-10T10:00:00+00:00",
      },
      error: null,
    });

    await expect(createBankingSyncStore(client).acquire(ownerUserId, runId)).resolves.toEqual({
      integrationId: "33333333-3333-4333-8333-333333333333",
      initialCreatedFrom: "2026-03-10",
      initialCreatedFromInstant: "2026-03-09T23:00:00.000Z",
      updatedFrom: "2026-09-01T10:00:00.000Z",
      updatedTo: "2026-09-10T10:00:00.000Z",
    });
    expect(rpc).toHaveBeenCalledWith("acquire_banking_sync", {
      p_owner_user_id: ownerUserId,
      p_run_id: runId,
    });
  });

  it("serializes only allowlisted account fields with the account stream contract", async () => {
    const { client, rpc } = clientWithRpc({ data: null, error: null });
    const store = createBankingSyncStore(client);

    await store.stageAccounts(ownerUserId, runId, 1, null, [
      {
        externalId: "account-fake",
        name: "Compte fictif",
        ibanMasked: "FR76••••••••••••••••••••1234",
        currency: "EUR",
        currentBalanceCents: 12_345,
        availableBalanceCents: null,
        status: "active",
        updatedAt: "2026-09-10T08:00:00.000Z",
      },
    ]);

    expect(rpc).toHaveBeenCalledWith("stage_banking_page", {
      p_owner_user_id: ownerUserId,
      p_run_id: runId,
      p_kind: "accounts",
      p_account_external_id: null,
      p_page: 1,
      p_next_page: null,
      p_items: [
        {
          external_id: "account-fake",
          name: "Compte fictif",
          iban_masked: "FR76••••••••••••••••••••1234",
          currency: "EUR",
          current_balance_cents: 12_345,
          available_balance_cents: null,
          status: "active",
          updated_at: "2026-09-10T08:00:00.000Z",
        },
      ],
    });
  });

  it("serializes only allowlisted transaction fields with the account identifier", async () => {
    const { client, rpc } = clientWithRpc({ data: null, error: null });
    const store = createBankingSyncStore(client);

    await store.stageTransactions(ownerUserId, runId, "account-fake", 2, 3, [
      {
        externalId: "transaction-fake",
        accountExternalId: "account-fake",
        currency: "EUR",
        amountCents: 2_500,
        direction: "outflow",
        status: "pending",
        label: "Achat fictif",
        counterparty: null,
        transactionDate: "2026-09-09",
        valueDate: null,
        updatedAt: "2026-09-10T08:30:00.000Z",
      },
    ]);

    expect(rpc).toHaveBeenCalledWith("stage_banking_page", {
      p_owner_user_id: ownerUserId,
      p_run_id: runId,
      p_kind: "transactions",
      p_account_external_id: "account-fake",
      p_page: 2,
      p_next_page: 3,
      p_items: [
        {
          external_id: "transaction-fake",
          account_external_id: "account-fake",
          currency: "EUR",
          amount_cents: 2_500,
          direction: "outflow",
          status: "pending",
          label: "Achat fictif",
          counterparty: null,
          transaction_date: "2026-09-09",
          value_date: null,
          updated_at: "2026-09-10T08:30:00.000Z",
        },
      ],
    });
  });

  it("uses the exact owner-scoped renewal, publication, and failure RPC parameters", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { created: 2, updated: 3 }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const store = createBankingSyncStore({ rpc } as unknown as SupabaseClient);

    await store.renew(ownerUserId, runId);
    await expect(store.publish(ownerUserId, runId)).resolves.toEqual({ created: 2, updated: 3 });
    await store.fail(ownerUserId, runId, "PROVIDER_RATE_LIMIT", true);

    expect(rpc.mock.calls).toEqual([
      ["renew_banking_sync", { p_owner_user_id: ownerUserId, p_run_id: runId }],
      ["publish_banking_sync", { p_owner_user_id: ownerUserId, p_run_id: runId }],
      [
        "fail_banking_sync",
        {
          p_owner_user_id: ownerUserId,
          p_run_id: runId,
          p_error_code: "PROVIDER_RATE_LIMIT",
          p_connection_succeeded: true,
        },
      ],
    ]);
  });

  it("maps only the exact structured lock signal and hides raw database detail", async () => {
    const canary = "fictitious-private-canary";
    const { client } = clientWithRpc({
      data: null,
      error: { code: "P0001", message: "SYNC_LOCKED", details: canary, hint: canary },
    });

    const error = await createBankingSyncStore(client)
      .acquire(ownerUserId, runId)
      .catch((caught: unknown) => caught);

    expect(error).toEqual(new SyncStoreError("SYNC_LOCKED", false));
    expect(JSON.stringify(error)).not.toContain(canary);
  });

  it.each([
    ["08006", true],
    ["40001", true],
    ["40P01", true],
    ["53300", true],
    ["57P03", true],
    ["P0001", false],
    ["42501", false],
  ])("classifies structured database code %s without inspecting its message", async (code, transient) => {
    const { client } = clientWithRpc({
      data: null,
      error: { code, message: "fictitious-private-canary" },
    });

    const error = await createBankingSyncStore(client)
      .publish(ownerUserId, runId)
      .catch((caught: unknown) => caught);

    expect(error).toEqual(new SyncStoreError("DATABASE_ERROR", transient));
    expect((error as Error).message).not.toContain("fictitious-private-canary");
  });

  it("classifies the resolved Supabase status-zero transport shape as transient", async () => {
    const canary = "fictitious-private-canary";
    const { client } = clientWithRpc({
      data: null,
      error: { code: "", message: canary, details: canary, hint: "" },
      count: null,
      status: 0,
      statusText: canary,
    });

    const error = await createBankingSyncStore(client)
      .publish(ownerUserId, runId)
      .catch((caught: unknown) => caught);

    expect(error).toEqual(new SyncStoreError("DATABASE_ERROR", true));
    expect(JSON.stringify(error)).not.toContain(canary);
  });

  it("treats a thrown transport failure as transient without retaining its cause", async () => {
    const client = {
      rpc: vi.fn().mockRejectedValue(new Error("fictitious-private-canary")),
    } as unknown as SupabaseClient;

    const error = await createBankingSyncStore(client)
      .publish(ownerUserId, runId)
      .catch((caught: unknown) => caught);

    expect(error).toEqual(new SyncStoreError("DATABASE_ERROR", true));
    expect(JSON.stringify(error)).not.toContain("fictitious-private-canary");
  });

  it("rejects malformed RPC output with a stable database error", async () => {
    const { client } = clientWithRpc({
      data: { created: -1, updated: "3", raw: "fictitious-private-canary" },
      error: null,
    });

    await expect(createBankingSyncStore(client).publish(ownerUserId, runId)).rejects.toEqual(
      new SyncStoreError("DATABASE_ERROR", false),
    );
  });
});


afterEach(() => vi.useRealTimers());

it.each(["acquire", "renew", "stageAccounts", "stageTransactions", "publish", "fail"] as const)(
  "cancels the real PostgREST transport for %s", async (method) => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    let aborted = false;
    const client = createClient("http://127.0.0.1:56321", "synthetic-test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (_url, init) => {
        requestSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener("abort", () => { aborted = true; reject(new Error("synthetic abort")); }, { once: true });
        });
      } },
    });
    const controller = new AbortController();
    const store = createBankingSyncStore(client);
    const invoke = () => {
      if (method === "stageAccounts") return store.stageAccounts(ownerUserId, runId, 1, null, [], controller.signal);
      if (method === "stageTransactions") return store.stageTransactions(ownerUserId, runId, "synthetic", 1, null, [], controller.signal);
      if (method === "fail") return store.fail(ownerUserId, runId, "DATABASE_ERROR", true, controller.signal);
      return store[method](ownerUserId, runId, controller.signal);
    };
    let error: unknown;
    const result = invoke().catch(value => { error = value; });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(aborted).toBe(true);
    expect(requestSignal?.aborted).toBe(true);
    await result;
    expect(error).toEqual(new SyncStoreError("DATABASE_ERROR", true));
  },
);


it("accepts a NULL automatic admission without weakening the manual contract", async () => {
  const { client, rpc } = clientWithRpc({ data: null, error: null });
  await expect(createBankingSyncStore(client, { mode: "automatic" }).acquire(ownerUserId, runId)).resolves.toBeNull();
  expect(rpc).toHaveBeenCalledWith("acquire_automatic_banking_sync", { p_owner_user_id: ownerUserId, p_run_id: runId });
  await expect(createBankingSyncStore(client).acquire(ownerUserId, runId)).rejects.toEqual(new SyncStoreError("DATABASE_ERROR", false));
});
