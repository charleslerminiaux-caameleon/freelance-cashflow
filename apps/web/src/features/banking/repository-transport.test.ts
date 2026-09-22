// @vitest-environment node
import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";

import { getBankingSnapshot } from "./repository";

const owner = "11111111-1111-4111-8111-111111111111";
const integrationId = "22222222-2222-4222-8222-222222222222";

function transportFixture(publishDuringHistory = false) {
  let generation = 1;
  let published = false;
  const requests: Array<{ table: string; signal: AbortSignal | null | undefined }> = [];
  const networkTables: string[] = [];
  const memoized = new Map<string, Response>();
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1)!;
    requests.push({ table, signal: init?.signal });
    expect(init?.method).toBe("GET");
    expect(url.searchParams.get("owner_user_id")).toBe(`eq.${owner}`);
    const key = url.toString();
    // Deterministic render-cache fixture follows the installed Next dedupe-fetch
    // signal opt-out. The real Supabase/PostgREST client constructs every request.
    if (!init?.signal && memoized.has(key)) return memoized.get(key)!.clone();
    networkTables.push(table);
    let rows: unknown;
    if (table === "integrations") {
      rows = [{ id: integrationId, provider: "qonto", status: "connected", last_success_at: `2026-09-10T10:00:00.00000${generation}Z`, last_connection_succeeded: true, last_error_code: null }];
    } else if (table === "bank_accounts") {
      const length = url.searchParams.get("offset") === "0" ? 1000 : 1;
      rows = Array.from({ length }, () => ({ id: owner, name: "Compte exemple", iban_masked: null, currency: "EUR", current_balance_cents: generation * 100, available_balance_cents: null, status: "active", is_current: true, updated_at: "2026-09-10T10:00:00Z" }));
    } else {
      expect(table).toBe("bank_transactions");
      rows = [{ id: owner, bank_account_id: owner, currency: "EUR", amount_cents: generation * 10, direction: "inflow", status: "completed", label: "Exemple", counterparty: null, transaction_date: "2026-09-10", value_date: null, updated_at: "2026-09-10T10:00:00Z" }];
      if (publishDuringHistory && !published) { generation += 1; published = true; }
    }
    const response = new Response(JSON.stringify(rows), { headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" } });
    if (!init?.signal) memoized.set(key, response.clone());
    return response;
  };
  const client = createClient("https://example.invalid", "synthetic-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: transport },
  });
  return { client, requests, networkTables };
}

it("passes an explicit signal through real PostgREST for both controls, every account page and history", async () => {
  const { client, requests, networkTables } = transportFixture();
  const snapshot = await getBankingSnapshot(client, owner, { historyPage: 1 });
  expect(snapshot.accounts).toHaveLength(1001);
  expect(requests.map(request => request.table)).toEqual([
    "integrations", "bank_accounts", "bank_accounts", "bank_transactions", "integrations",
  ]);
  expect(requests.every(request => request.signal instanceof AbortSignal)).toBe(true);
  expect(networkTables).toHaveLength(5);
});

it("observes publication changes and refetches account pages and history despite identical GET URLs", async () => {
  const { client, requests, networkTables } = transportFixture(true);
  const snapshot = await getBankingSnapshot(client, owner, { historyPage: 1 });
  expect(snapshot.integration?.last_success_at).toBe("2026-09-10T10:00:00.000002Z");
  expect(snapshot.accounts.every(account => account.current_balance_cents === 200)).toBe(true);
  expect(snapshot.history.items[0]?.amount_cents).toBe(20);
  expect(requests.every(request => request.signal instanceof AbortSignal)).toBe(true);
  expect(networkTables).toHaveLength(10);
});

it("reads complete history beyond 1000 within the balance publication bracket", async () => {
  let generation = 1; let flipped = false;
  const offsets: number[] = [];
  const client = createClient("https://example.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input)); const table = url.pathname.split("/").at(-1);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(url.searchParams.get("owner_user_id")).toBe(`eq.${owner}`);
    let rows: unknown[];
    if (table === "integrations") rows = [{ id: integrationId, provider: "qonto", status: "connected", last_success_at: `2026-09-10T10:00:00.00000${generation}Z`, last_connection_succeeded: true, last_error_code: null }];
    else if (table === "bank_accounts") rows = [{ id: owner, name: "Synthetic", iban_masked: null, currency: "EUR", current_balance_cents: generation * 100, available_balance_cents: null, status: "active", is_current: true, updated_at: "2026-09-10T10:00:00Z" }];
    else {
      expect(url.searchParams.get("integration_id")).toBe(`eq.${integrationId}`);
      expect(url.searchParams.get("transaction_date")).toBe("gte.2026-03-11");
      const offset = Number(url.searchParams.get("offset")); offsets.push(offset);
      rows = Array.from({ length: offset === 0 ? 1000 : 1 }, () => ({ id: owner, bank_account_id: owner, currency: "EUR", amount_cents: generation * 10, direction: "outflow", status: "completed", label: "Synthetic", counterparty: null, transaction_date: "2026-09-10", value_date: null, updated_at: "2026-09-10T10:00:00Z" }));
      if (offset === 1000 && !flipped) { generation++; flipped = true; }
    }
    return new Response(JSON.stringify(rows), { headers: { "Content-Type": "application/json" } });
  } } });
  const snapshot = await getBankingSnapshot(client, owner, { fullHistory: { since: "2026-03-11", until: "2026-09-11" } });
  expect(snapshot.fullTransactions).toHaveLength(1001);
  expect(snapshot.fullTransactions?.every(row => row.amount_cents === 20)).toBe(true);
  expect(snapshot.accounts[0]?.current_balance_cents).toBe(200);
  expect(offsets).toEqual([0, 1000, 0, 1000]);
});

it("rejects a transaction page cap overflow rather than returning partial history", async () => {
  const { listAllBankTransactions } = await import("./repository");
  let requests = 0;
  const rows = Array.from({ length: 1000 }, () => ({ id: owner, bank_account_id: owner, currency: "EUR", amount_cents: 1, direction: "outflow", status: "completed", label: "Synthetic", counterparty: null, transaction_date: "2026-09-10", value_date: null, updated_at: "2026-09-10T10:00:00Z" }));
  const client = createClient("https://example.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async () => { requests++; return new Response(JSON.stringify(rows), { headers: { "Content-Type": "application/json" } }); } } });
  await expect(listAllBankTransactions(client, owner, integrationId, { since: "2026-03-11", until: "2026-09-11" }, new AbortController().signal)).rejects.toThrow(/^DATABASE_ERROR$/);
  expect(requests).toBe(101);
});
