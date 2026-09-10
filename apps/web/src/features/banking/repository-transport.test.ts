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
      rows = [{ id: integrationId, status: "connected", last_success_at: `2026-09-10T10:00:00.00000${generation}Z`, last_connection_succeeded: true, last_error_code: null }];
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
