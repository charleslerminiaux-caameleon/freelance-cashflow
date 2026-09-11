import { localDate } from "@fc/shared";

import {
  addDays,
  dateForMonth,
  daysInMonth,
  monthSerial,
  parseDate,
  subtractMonthsClamped,
} from "./recurring-detection-dates";
import type {
  DetectionTransaction,
  MonthlyDetectionInput,
  RecurringCandidate,
} from "./recurring-detection-types";

const MINIMUM_RUN_LENGTH = 3;
const MAXIMUM_DAY_ERROR = 3;
const FRESHNESS_GRACE_DAYS = 7;
const MAXIMUM_LABEL_LENGTH = 160;

function requireNonemptyId(value: string, description: string): void {
  if (value.length === 0) {
    throw new Error(`${description} must be nonempty`);
  }
}

function transactionIdentity(transaction: DetectionTransaction): string {
  return [
    transaction.accountId,
    transaction.currency,
    normalizeRecurringLabel(transaction.label),
  ].join("\u0000");
}

function transactionsEqual(left: DetectionTransaction, right: DetectionTransaction): boolean {
  return (
    left.id === right.id &&
    left.accountId === right.accountId &&
    left.currency === right.currency &&
    left.label === right.label &&
    left.amountCents === right.amountCents &&
    left.direction === right.direction &&
    left.status === right.status &&
    left.transactionDate === right.transactionDate
  );
}

function deduplicateTransactions(transactions: DetectionTransaction[]): {
  transactions: DetectionTransaction[];
  conflictingGroups: Set<string>;
} {
  const byId = new Map<string, DetectionTransaction>();
  const conflictingGroups = new Set<string>();

  for (const transaction of transactions) {
    requireNonemptyId(transaction.id, "Transaction id");
    requireNonemptyId(transaction.accountId, "Transaction account id");
    localDate(transaction.transactionDate);

    const existing = byId.get(transaction.id);
    if (existing === undefined) {
      byId.set(transaction.id, transaction);
    } else if (!transactionsEqual(existing, transaction)) {
      conflictingGroups.add(transactionIdentity(existing));
      conflictingGroups.add(transactionIdentity(transaction));
    }
  }

  return { transactions: [...byId.values()], conflictingGroups };
}

function medianAmount(transactions: DetectionTransaction[]): number {
  const amounts = transactions.map(({ amountCents }) => BigInt(amountCents));
  amounts.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const middle = Math.floor(amounts.length / 2);
  const median =
    amounts.length % 2 === 1
      ? amounts[middle]!
      : (amounts[middle - 1]! + amounts[middle]! + 1n) / 2n;
  return Number(median);
}

function amountWithinTolerance(amountCents: number, medianCents: number): boolean {
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    !Number.isSafeInteger(medianCents) ||
    medianCents <= 0
  ) {
    return false;
  }

  const amount = BigInt(amountCents);
  const median = BigInt(medianCents);
  return amount * 10n >= median * 9n && amount * 10n <= median * 11n;
}

function suggestedDay(transactions: DetectionTransaction[]): number {
  let bestDay = 1;
  let bestError = Number.POSITIVE_INFINITY;

  for (let candidate = 1; candidate <= 31; candidate += 1) {
    const totalError = transactions.reduce((sum, transaction) => {
      const date = parseDate(transaction.transactionDate);
      const clampedDay = Math.min(candidate, daysInMonth(date.year, date.month));
      return sum + Math.abs(date.day - clampedDay);
    }, 0);

    if (totalError <= bestError) {
      bestDay = candidate;
      bestError = totalError;
    }
  }

  return bestDay;
}

function isDayCoherent(
  transactions: DetectionTransaction[],
  dayOfMonth: number,
): boolean {
  return transactions.every((transaction) => {
    const date = parseDate(transaction.transactionDate);
    const expectedDay = Math.min(dayOfMonth, daysInMonth(date.year, date.month));
    return Math.abs(date.day - expectedDay) <= MAXIMUM_DAY_ERROR;
  });
}

function latestSingletonRun(
  transactions: DetectionTransaction[],
): DetectionTransaction[] {
  const byMonth = new Map<string, DetectionTransaction[]>();
  for (const transaction of transactions) {
    const month = transaction.transactionDate.slice(0, 7);
    const bucket = byMonth.get(month);
    if (bucket === undefined) {
      byMonth.set(month, [transaction]);
    } else {
      bucket.push(transaction);
    }
  }

  let latestRun: DetectionTransaction[] = [];
  let currentRun: DetectionTransaction[] = [];
  let previousMonth: number | undefined;

  for (const month of [...byMonth.keys()].sort()) {
    const bucket = byMonth.get(month)!;
    const serial = monthSerial(parseDate(`${month}-01`));
    if (bucket.length !== 1) {
      currentRun = [];
      previousMonth = undefined;
      continue;
    }

    if (previousMonth === undefined || serial !== previousMonth + 1) {
      currentRun = [];
    }
    currentRun.push(bucket[0]!);
    latestRun = [...currentRun];
    previousMonth = serial;
  }

  return latestRun.sort(
    (left, right) =>
      left.transactionDate.localeCompare(right.transactionDate) || left.id.localeCompare(right.id),
  );
}

export function normalizeRecurringLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function nextRecurringDate(
  dayOfMonth: number,
  lastPaymentDate: string,
  today: string,
): string {
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new Error("Day of month must be an integer from 1 to 31");
  }

  const lastPayment = parseDate(lastPaymentDate);
  localDate(today);
  let candidateMonth = monthSerial(lastPayment) + 1;
  let candidate = dateForMonth(candidateMonth, dayOfMonth);
  while (candidate <= today) {
    candidateMonth += 1;
    candidate = dateForMonth(candidateMonth, dayOfMonth);
  }
  return candidate;
}

export function detectMonthlyOutflows(
  input: MonthlyDetectionInput,
): RecurringCandidate[] {
  const today = localDate(input.today);
  const windowStart = subtractMonthsClamped(today, 6);

  const eligibleAccountIds = new Set<string>();
  for (const account of input.accounts) {
    requireNonemptyId(account.id, "Account id");
    if (
      account.active &&
      account.current &&
      account.currency === input.currency
    ) {
      eligibleAccountIds.add(account.id);
    }
  }

  const deduplicated = deduplicateTransactions(input.transactions);
  const groups = new Map<string, DetectionTransaction[]>();

  for (const transaction of deduplicated.transactions) {
    if (
      !eligibleAccountIds.has(transaction.accountId) ||
      transaction.currency !== input.currency ||
      transaction.direction !== "outflow" ||
      transaction.status !== "completed" ||
      !Number.isSafeInteger(transaction.amountCents) ||
      transaction.amountCents <= 0 ||
      transaction.transactionDate < windowStart ||
      transaction.transactionDate > today
    ) {
      continue;
    }

    const normalizedLabel = normalizeRecurringLabel(transaction.label);
    if (normalizedLabel.length === 0) {
      continue;
    }
    const key = transactionIdentity(transaction);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [transaction]);
    } else {
      group.push(transaction);
    }
  }

  const candidates: RecurringCandidate[] = [];
  for (const key of [...groups.keys()].sort()) {
    if (deduplicated.conflictingGroups.has(key)) {
      continue;
    }

    const run = latestSingletonRun(groups.get(key)!);
    if (run.length < MINIMUM_RUN_LENGTH) {
      continue;
    }

    const amountCents = medianAmount(run);
    if (!run.every((transaction) => amountWithinTolerance(transaction.amountCents, amountCents))) {
      continue;
    }

    const dayOfMonth = suggestedDay(run);
    if (!isDayCoherent(run, dayOfMonth)) {
      continue;
    }

    const latestPayment = run[run.length - 1]!;
    const immediateNextMonth = monthSerial(parseDate(latestPayment.transactionDate)) + 1;
    const immediateNextDate = dateForMonth(immediateNextMonth, dayOfMonth);
    if (addDays(immediateNextDate, FRESHNESS_GRACE_DAYS) < today) {
      continue;
    }

    candidates.push({
      accountId: latestPayment.accountId,
      currency: latestPayment.currency,
      normalizedLabel: normalizeRecurringLabel(latestPayment.label),
      label: latestPayment.label.slice(0, MAXIMUM_LABEL_LENGTH),
      amountCents,
      dayOfMonth,
      transactionIds: run.map(({ id }) => id),
      lastPaymentDate: latestPayment.transactionDate,
      nextDate: nextRecurringDate(dayOfMonth, latestPayment.transactionDate, today),
    });
  }

  return candidates;
}

export function paidMonthsForSeries(
  series: Pick<
    RecurringCandidate,
    "accountId" | "currency" | "normalizedLabel" | "amountCents"
  >,
  transactions: DetectionTransaction[],
): string[] {
  requireNonemptyId(series.accountId, "Series account id");
  if (!Number.isSafeInteger(series.amountCents) || series.amountCents <= 0) {
    return [];
  }

  const deduplicated = deduplicateTransactions(transactions);
  const seriesKey = [series.accountId, series.currency, series.normalizedLabel].join("\u0000");
  if (deduplicated.conflictingGroups.has(seriesKey)) {
    return [];
  }

  const months = new Set<string>();
  for (const transaction of deduplicated.transactions) {
    if (
      transaction.accountId === series.accountId &&
      transaction.currency === series.currency &&
      normalizeRecurringLabel(transaction.label) === series.normalizedLabel &&
      transaction.direction === "outflow" &&
      transaction.status === "completed" &&
      amountWithinTolerance(transaction.amountCents, series.amountCents)
    ) {
      months.add(transaction.transactionDate.slice(0, 7));
    }
  }

  return [...months].sort();
}
