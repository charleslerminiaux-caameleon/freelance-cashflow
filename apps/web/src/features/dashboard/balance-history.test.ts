import { describe, expect, it } from "vitest";
import { localDate } from "@fc/shared";
import type { BankingSnapshot, BankTransaction } from "@/features/banking/repository";
import { buildBalanceHistory } from "./balance-history";

function snapshot(): BankingSnapshot {
  return {
    integration: null,
    integrations: [{ id: "bank", provider: "qonto", status: "connected", last_success_at: "2026-09-24T10:00:00Z", last_connection_succeeded: true, last_error_code: null }],
    accounts: [{ id: "account", integration_id: "bank", name: "Compte", iban_masked: null, currency: "EUR", current_balance_cents: 10000, available_balance_cents: 8000, status: "active", updated_at: "2026-09-24T10:00:00Z", is_current: true }],
    fullHistoryWindow: { since: "2026-06-01", until: "2026-09-24" },
    fullTransactions: [],
  };
}
function transaction(overrides: Partial<BankTransaction>): BankTransaction {
  return { id: "tx", bank_account_id: "account", currency: "EUR", amount_cents: 2000, direction: "inflow", status: "completed", label: "Paiement", counterparty: null, transaction_date: localDate("2026-09-24"), value_date: null, updated_at: "2026-09-24T10:00:00Z", ...overrides };
}
const history = (banking?: BankingSnapshot) => buildBalanceHistory(banking, "EUR", "Europe/Paris", localDate("2026-09-24"));
describe("reconstructed bank balance history", () => {
  it("reverses only completed movements of included accounts and currency, leaving today's booked balance intact", () => {
    const bank = snapshot();
    bank.fullTransactions = [transaction({}), transaction({ id: "out", transaction_date: localDate("2026-09-23"), direction: "outflow", amount_cents: 500 }), transaction({ status: "pending" }), transaction({ currency: "USD" }), transaction({ bank_account_id: "other" }), transaction({ transaction_date: localDate("2026-09-25") })];
    expect(history(bank).points.slice(-3)).toEqual([
      { date: "2026-09-22", actualBalanceCents: 8500 },
      { date: "2026-09-23", actualBalanceCents: 8000 },
      { date: "2026-09-24", actualBalanceCents: 10000 },
    ]);
  });
  it("books a previously pending movement on its completion date rather than its creation date", () => {
    const bank = snapshot();
    bank.fullTransactions = [transaction({ transaction_date: localDate("2026-09-20"), value_date: localDate("2026-09-23") })];
    expect(history(bank).points.slice(-3)).toEqual([
      { date: "2026-09-22", actualBalanceCents: 8000 },
      { date: "2026-09-23", actualBalanceCents: 10000 },
      { date: "2026-09-24", actualBalanceCents: 10000 },
    ]);
  });
  it("does not reverse a movement whose value date is after the account publication", () => {
    const bank = snapshot();
    bank.fullTransactions = [transaction({ transaction_date: localDate("2026-09-23"), value_date: localDate("2026-09-25") })];
    expect(history(bank).points.slice(-3)).toEqual([
      { date: "2026-09-22", actualBalanceCents: 10000 },
      { date: "2026-09-23", actualBalanceCents: 10000 },
      { date: "2026-09-24", actualBalanceCents: 10000 },
    ]);
  });
  it("does not fabricate manual or incomplete transaction history", () => {
    expect(history().points).toEqual([]);
    const bank = snapshot(); delete bank.fullHistoryWindow;
    expect(history(bank).points).toEqual([]);
  });
  it("aligns independently published accounts to their common business date without extrapolating stale balances", () => {
    const bank = snapshot();
    bank.integrations!.push({ ...bank.integrations![0]!, id: "second", provider: "bunq", last_success_at: "2026-09-22T23:30:00Z" });
    bank.accounts.push({ ...bank.accounts[0]!, id: "account-b", integration_id: "second", current_balance_cents: 3000 });
    bank.fullTransactions = [transaction({}), transaction({ id: "later-that-day", transaction_date: localDate("2026-09-23"), amount_cents: 100 })];
    expect(history(bank).points.at(-1)).toEqual({ date: "2026-09-22", actualBalanceCents: 10900 });
  });
  it("limits reconstruction to the fetched coverage and ignores unpublished or inactive accounts", () => {
    const bank = snapshot(); bank.fullHistoryWindow!.since = "2026-09-23";
    bank.accounts.push({ ...bank.accounts[0]!, id: "unpublished", integration_id: "missing" }, { ...bank.accounts[0]!, id: "closed", status: "closed" });
    expect(history(bank).points).toEqual([{date: "2026-09-23", actualBalanceCents: 10000}, {date: "2026-09-24", actualBalanceCents: 10000}]);
  });
});
