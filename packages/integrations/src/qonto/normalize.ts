import { localDate, moneyCents } from "@fc/shared";

import type { NormalizedBankAccount, NormalizedBankTransaction } from "../banking";
import { IntegrationError } from "../errors";
import { qontoAccountSchema, qontoTransactionSchema } from "./schemas";

function invalidResponse(): IntegrationError {
  return new IntegrationError("PROVIDER_INVALID_RESPONSE");
}

function maskIban(iban: string | null | undefined): string | null {
  if (iban == null) return null;
  return `${iban.slice(0, 4)}${"•".repeat(iban.length - 8)}${iban.slice(-4)}`;
}

function businessDate(instant: string, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(instant))
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  return localDate(`${parts.year}-${parts.month}-${parts.day}`);
}

export function normalizeAccount(input: unknown): NormalizedBankAccount {
  const parsed = qontoAccountSchema.safeParse(input);
  if (!parsed.success) throw invalidResponse();
  const account = parsed.data;
  return {
    externalId: account.id,
    name: account.name,
    ibanMasked: maskIban(account.iban),
    currency: account.currency,
    currentBalanceCents: moneyCents(account.balance_cents),
    availableBalanceCents:
      account.authorized_balance_cents == null
        ? null
        : moneyCents(account.authorized_balance_cents),
    status: account.status,
    updatedAt: account.updated_at,
  };
}

export function normalizeTransaction(
  input: unknown,
  accountExternalId: string,
  timezone: string,
): NormalizedBankTransaction {
  const parsed = qontoTransactionSchema.safeParse(input);
  if (!parsed.success) throw invalidResponse();
  const transaction = parsed.data;
  if (
    transaction.bank_account_id !== undefined &&
    transaction.bank_account_id !== accountExternalId
  ) {
    throw invalidResponse();
  }

  try {
    return {
      externalId: transaction.transaction_id,
      accountExternalId,
      currency: transaction.currency,
      amountCents: moneyCents(transaction.amount_cents),
      direction: transaction.side === "credit" ? "inflow" : "outflow",
      status: transaction.status,
      label: transaction.label,
      counterparty: null,
      transactionDate: businessDate(transaction.emitted_at, timezone),
      valueDate:
        transaction.settled_at == null
          ? null
          : businessDate(transaction.settled_at, timezone),
      updatedAt: transaction.updated_at,
    };
  } catch {
    throw invalidResponse();
  }
}
