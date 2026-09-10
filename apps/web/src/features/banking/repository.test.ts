import type { IntegrationState } from "@/features/integrations/status";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { listBankAccounts, listBankTransactions, parseBankPage, getBankingSnapshot } from "./repository";
const owner = "11111111-1111-4111-8111-111111111111";
const integration = "22222222-2222-4222-8222-222222222222";
const account = { id: owner, name: "Compte exemple", iban_masked: "FR00•••••••••••1234", currency: "EUR", current_balance_cents: 0, available_balance_cents: null, status: "active", updated_at: "2026-09-10T10:00:00Z", is_current: true };
function client(data: unknown, count = 0, error: unknown = null) {
 const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data, count, error }) };
 return {query, db: {from: vi.fn(() => query)}};
}
it("reads allowlisted published accounts with owner/integration scope, keeping zero balances", async () => {
 const {db, query} = client([{ ...account, raw: "private" }]);
 const rows = await listBankAccounts(db as unknown as SupabaseClient, owner, integration);
 expect(db.from).toHaveBeenCalledWith("bank_accounts"); expect(query.eq).toHaveBeenCalledWith("owner_user_id", owner); expect(query.eq).toHaveBeenCalledWith("integration_id", integration);
 expect(query.select.mock.calls[0]?.[0]).not.toMatch(/\*|metadata|external_id/); expect(rows[0]?.current_balance_cents).toBe(0); expect(rows[0]).not.toHaveProperty("raw");
});
it.each([null, undefined, Number.MAX_SAFE_INTEGER + 1, "100"])("rejects unusable monetary data %s safely", async (balance) => {
 const {db} = client([{ ...account, current_balance_cents: balance }]); await expect(listBankAccounts(db as unknown as SupabaseClient, owner, integration)).rejects.toThrow("DATABASE_ERROR");
});
it("does not pass through an unmasked IBAN", async () => {
 const {db} = client([{ ...account, iban_masked: "FR00" + "0".repeat(23) }]); await expect(listBankAccounts(db as unknown as SupabaseClient, owner, integration)).rejects.toThrow("DATABASE_ERROR");
});
it("paginates transaction history by 50 in stable descending date/id order", async () => {
 const {db, query} = client([], 101); const result = await listBankTransactions(db as unknown as SupabaseClient, owner, integration, 2);
 expect(db.from).toHaveBeenCalledWith("bank_transactions"); expect(query.eq).toHaveBeenCalledWith("owner_user_id", owner); expect(query.eq).toHaveBeenCalledWith("integration_id", integration); expect(query.range).toHaveBeenCalledWith(50,99);
 expect(query.order.mock.calls).toEqual([["transaction_date", {ascending:false}], ["id", {ascending:false}]]); expect(result).toEqual({ items: [], page: 2, hasNext: true });
});
it.each([undefined, "0", "-1", "1.2", "1e2", ["2"], "9007199254740991"])("validates bankPage %s", value => expect(parseBankPage(value)).toBe(1));
it("accepts a decimal page", () => expect(parseBankPage("2")).toBe(2));
it("rejects invalid direct page before DB access", async () => { const {db} = client([]); await expect(listBankTransactions(db as unknown as SupabaseClient, owner, integration, -1)).rejects.toThrow(); expect(db.from).not.toHaveBeenCalled(); });

it("loads all account pages rather than silently truncating a balance", async () => {
 const {db,query}=client([]); query.range.mockResolvedValueOnce({data:Array.from({length:1000},()=>account),error:null}).mockResolvedValueOnce({data:[{...account,id:integration}],error:null});
 expect(await listBankAccounts(db as unknown as SupabaseClient,owner,integration)).toHaveLength(1001); expect(query.range.mock.calls).toEqual([[0,999],[1000,1999]]);
});
it("retains published accounts after provider failure without consulting live config", async () => {
 const control = {select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({data:{id:integration,status:"error",last_success_at:"2026-09-10T10:00:00Z",last_connection_succeeded:false,last_error_code:"PROVIDER_AUTH_EXPIRED"},error:null})};
 const {query}=client([account]); const db={from:vi.fn((name:string)=>name==="integrations"?control:query)};
 expect((await getBankingSnapshot(db as unknown as SupabaseClient,owner)).accounts).toHaveLength(1); expect(db.from.mock.calls).toEqual([["integrations"],["bank_accounts"],["integrations"]]);
});

function publicationClient({ changeAt, continuous = false, metadataOnly }: {
  changeAt: "account" | "second-account-page" | "history";
  continuous?: boolean;
  metadataOnly?: "error" | "syncing";
}) {
  let generation = 1;
  let changed = false;
  let failed = false;
  const marker = () => `2026-09-10T10:00:00.00000${generation}Z`;
  function publish() {
    if (continuous || !changed) {
      changed = true;
      if (metadataOnly) failed = true; else generation += 1;
    }
  }
  const control = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async (): Promise<{ error: null; data: IntegrationState | null }> => ({ error: null, data: {
      id: integration, status: failed ? metadataOnly ?? "error" : "connected",
      last_success_at: marker(), last_connection_succeeded: metadataOnly === "error" ? !failed : true,
      last_error_code: failed && metadataOnly === "error" ? "PROVIDER_UNAVAILABLE" : null,
    } })),
  };
  const accounts = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    range: vi.fn(async (from: number) => {
      if (changeAt === "account" || (changeAt === "second-account-page" && from === 1000)) publish();
      return { error: null, data: Array.from({ length: changeAt === "second-account-page" && from === 0 ? 1000 : 1 }, () => ({
        ...account, current_balance_cents: generation * 100,
      })) };
    }),
  };
  const transactions = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    range: vi.fn(async () => {
      if (changeAt === "history") publish();
      return { error: null, count: 1, data: [{ id: owner, bank_account_id: owner, currency: "EUR", amount_cents: generation * 10,
        direction: "inflow", status: "completed", label: "Exemple", counterparty: null,
        transaction_date: "2026-09-10", value_date: null, updated_at: "2026-09-10T10:00:00Z" }] };
    }),
  };
  const db = { from: vi.fn((table: string) => table === "integrations" ? control : table === "bank_accounts" ? accounts : transactions) };
  return { db: db as unknown as SupabaseClient, control, accounts, transactions };
}

it.each(["account", "second-account-page"] as const)("retries a publication during %s reads, retaining microsecond marker precision", async (changeAt) => {
  const { db, control } = publicationClient({ changeAt });
  const result = await getBankingSnapshot(db, owner);
  expect(result.integration?.last_success_at).toBe("2026-09-10T10:00:00.000002Z");
  expect(result.accounts.every(row => row.current_balance_cents === 200)).toBe(true);
  expect(control.maybeSingle).toHaveBeenCalledTimes(4);
});

it("fails with a bounded stable error when publication continually changes", async () => {
  const { db, control, accounts } = publicationClient({ changeAt: "account", continuous: true });
  await expect(getBankingSnapshot(db, owner)).rejects.toThrow(/^DATABASE_ERROR$/);
  expect(control.maybeSingle).toHaveBeenCalledTimes(6);
  expect(accounts.range).toHaveBeenCalledTimes(3);
});

it("retries accounts and history together if publication occurs during the history read", async () => {
  const { db, control, transactions } = publicationClient({ changeAt: "history" });
  const result = await getBankingSnapshot(db, owner, { historyPage: 1 });
  expect(result.accounts[0]?.current_balance_cents).toBe(200);
  expect(result.history.items[0]?.amount_cents).toBe(20);
  expect(result.integration?.last_success_at).toBe("2026-09-10T10:00:00.000002Z");
  expect(control.maybeSingle).toHaveBeenCalledTimes(4);
  expect(transactions.range).toHaveBeenCalledTimes(2);
});

it.each(["error", "syncing"] as const)("returns the latest %s metadata without retrying an unchanged publication", async (metadataOnly) => {
  const { db, control, accounts } = publicationClient({ changeAt: "account", metadataOnly });
  const result = await getBankingSnapshot(db, owner);
  expect(result.integration?.last_success_at).toBe("2026-09-10T10:00:00.000001Z");
  expect(result.integration?.status).toBe(metadataOnly);
  expect(result.integration?.last_connection_succeeded).toBe(metadataOnly !== "error");
  expect(result.accounts[0]?.current_balance_cents).toBe(100);
  expect(control.maybeSingle).toHaveBeenCalledTimes(2);
  expect(accounts.range).toHaveBeenCalledTimes(1);
});

it("does not return unpublished fallback when the first publication appears during the read", async () => {
  const { db, control } = publicationClient({ changeAt: "history" });
  control.maybeSingle.mockResolvedValueOnce({ error: null, data: null });
  const result = await getBankingSnapshot(db, owner);
  expect(result.accounts[0]?.current_balance_cents).toBe(100);
  expect(result.integration?.last_success_at).toBe("2026-09-10T10:00:00.000001Z");
  expect(control.maybeSingle).toHaveBeenCalledTimes(4);
});

it("bounds retries when history is continuously republished", async () => {
  const { db, control, transactions } = publicationClient({ changeAt: "history", continuous: true });
  await expect(getBankingSnapshot(db, owner, { historyPage: 1 })).rejects.toThrow(/^DATABASE_ERROR$/);
  expect(control.maybeSingle).toHaveBeenCalledTimes(6);
  expect(transactions.range).toHaveBeenCalledTimes(3);
});
