import { normalizeRecurringLabel, paidMonthsForSeries, type DetectionTransaction } from "@fc/domain";
import type { BankTransaction } from "@/features/banking/repository";
import type { RecurringSuggestion } from "./schema";

export type ObservedTransaction = Pick<BankTransaction, "id" | "bank_account_id" | "currency" | "label" | "amount_cents" | "direction" | "transaction_date"> & { status: string };
export function detectionTransactions(transactions: ObservedTransaction[]): DetectionTransaction[] {
  return transactions.map(row => ({ id: row.id, accountId: row.bank_account_id, currency: row.currency, label: row.label, amountCents: row.amount_cents, direction: row.direction, status: row.status, transactionDate: row.transaction_date }));
}
export function paidMonthsByExpense(
  series: Pick<RecurringSuggestion, "state" | "linkedExpenseId" | "accountId" | "currency" | "normalizedLabel" | "amountCents">[],
  transactions: ObservedTransaction[],
): Record<string, string[]> {
  const observed = detectionTransactions(transactions);
  const key = (account: string, currency: string, label: string) => JSON.stringify([account, currency, label]);
  const grouped = new Map<string, DetectionTransaction[]>();
  const identityById = new Map<string, string>();
  const conflicting = new Set<string>();
  for (const row of observed) {
    const identity = key(row.accountId, row.currency, normalizeRecurringLabel(row.label));
    const existing = identityById.get(row.id);
    if (existing !== undefined && existing !== identity) { conflicting.add(existing); conflicting.add(identity); }
    else identityById.set(row.id, identity);
    const bucket = grouped.get(identity) ?? []; bucket.push(row); grouped.set(identity, bucket);
  }
  // Partition once so each series does not repeatedly scan/normalize the entire
  // bank history. Cross-identity duplicate IDs invalidate all implicated groups;
  // within-group duplicate/status/amount rules remain the domain helper's job.
  return Object.fromEntries(series.filter(item => item.state === "confirmed" && item.linkedExpenseId !== null)
    .map(item => {
      const identity = key(item.accountId, item.currency, item.normalizedLabel);
      return [item.linkedExpenseId!, conflicting.has(identity) ? [] : paidMonthsForSeries(item, grouped.get(identity) ?? [])];
    }));
}
