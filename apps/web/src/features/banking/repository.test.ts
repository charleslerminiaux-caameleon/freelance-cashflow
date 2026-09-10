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
 expect((await getBankingSnapshot(db as unknown as SupabaseClient,owner)).accounts).toHaveLength(1); expect(db.from.mock.calls).toEqual([["integrations"],["bank_accounts"]]);
});
