import type { BankingSnapshot } from "@/features/banking/repository";
import { localDate, moneyCents, type LocalDate, type MoneyCents } from "@fc/shared";

export type BalanceHistory = { points: Array<{ date: LocalDate; actualBalanceCents: MoneyCents }> };

function addDays(date: LocalDate, days: number): LocalDate {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return localDate(value.toISOString().slice(0, 10));
}

/** Reconstruct daily booked balances from the same published account/transaction snapshot.
 * Coverage describes local imported transactions, not an assertion of provider completeness.
 * The last day is capped at the oldest account publication; stale balances are never carried forward.
 */
export function buildBalanceHistory(banking: BankingSnapshot | undefined, currency: string, timezone: string, today: LocalDate): BalanceHistory {
  const coverage = banking?.fullHistoryWindow;
  if (!banking?.fullTransactions || !coverage) return { points: [] };
  const integrations = banking.integrations ?? (banking.integration ? [banking.integration] : []);
  const businessDate = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone });
  const accounts = banking.accounts.flatMap(account => {
    if (!account.is_current || account.status !== "active" || account.currency !== currency) return [];
    const integration = integrations.find(row => row.id === account.integration_id)
      ?? (!account.integration_id && integrations.length === 1 ? integrations[0] : undefined);
    if (!integration?.last_success_at) return [];
    const asOf = localDate(businessDate.format(new Date(integration.last_success_at)));
    return [{ ...account, asOf, publishedAt: integration.last_success_at }];
  });
  if (!accounts.length || accounts.some(account => account.asOf > today || account.asOf > coverage.until)) return { points: [] };
  const earliest = addDays(today, -90);
  const start = localDate(coverage.since > earliest ? coverage.since : earliest);
  const oldestDate = accounts.map(account => account.asOf).sort()[0]!;
  // Daily transaction dates cannot align two intraday snapshots. Use the last
  // complete common day whenever accounts were published at different instants.
  const mixedPublications = new Set(accounts.map(account => account.publishedAt)).size > 1;
  const end = mixedPublications ? addDays(oldestDate, -1) : oldestDate;
  if (start > end) return { points: [] };
  const movements = new Map<string, bigint>();
  const included = new Map(accounts.map(account => [account.id, account]));
  let balance = accounts.reduce((total, account) => total + BigInt(moneyCents(account.current_balance_cents)), 0n);
  for (const transaction of banking.fullTransactions) {
    const account = included.get(transaction.bank_account_id);
    const bookedDate = transaction.value_date ?? transaction.transaction_date;
    if (!account || transaction.status !== "completed" || transaction.currency !== currency
      || bookedDate < start || bookedDate > account.asOf) continue;
    const amount = BigInt(moneyCents(transaction.amount_cents)) * (transaction.direction === "inflow" ? 1n : -1n);
    // Bring each account back to the common last publication date first.
    if (bookedDate > end) balance -= amount;
    else movements.set(bookedDate, (movements.get(bookedDate) ?? 0n) + amount);
  }
  const points: BalanceHistory["points"] = [];
  for (let date = end; date >= start; date = addDays(date, -1)) {
    points.push({ date, actualBalanceCents: moneyCents(Number(balance)) });
    balance -= movements.get(date) ?? 0n;
  }
  return { points: points.reverse() };
}
