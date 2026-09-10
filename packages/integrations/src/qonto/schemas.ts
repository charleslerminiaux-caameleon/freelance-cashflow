import { z } from "zod";

const identifierSchema = z.string().trim().min(1).max(200);
const textSchema = z.string().trim().min(1).max(500);
const currencySchema = z.string().regex(/^[A-Z]{3}$/u);
const instantSchema = z.iso.datetime({ offset: true });
const safeCentsSchema = z.number().int().safe();

export const qontoAccountSchema = z.object({
  id: identifierSchema,
  name: textSchema,
  status: z.enum(["active", "closed"]),
  iban: z.string().trim().min(8).max(64).nullable().optional(),
  currency: currencySchema,
  balance_cents: safeCentsSchema,
  authorized_balance_cents: safeCentsSchema.nullable().optional(),
  updated_at: instantSchema,
});

export const qontoTransactionSchema = z.object({
  transaction_id: identifierSchema,
  bank_account_id: identifierSchema.optional(),
  amount_cents: safeCentsSchema.nonnegative(),
  side: z.enum(["credit", "debit"]),
  currency: currencySchema,
  label: textSchema,
  emitted_at: instantSchema,
  settled_at: instantSchema.nullable().optional(),
  updated_at: instantSchema,
  status: z.enum(["pending", "completed", "declined", "reversed"]),
});

export const qontoPaginationSchema = z.object({
  current_page: z.number().int().positive(),
  next_page: z.number().int().positive().nullable(),
  prev_page: z.number().int().positive().nullable(),
  total_pages: z.number().int().nonnegative(),
  total_count: z.number().int().nonnegative(),
  per_page: z.number().int().positive().max(100),
});

export const qontoAccountsEnvelopeSchema = z.object({
  bank_accounts: z.array(qontoAccountSchema).max(100),
  meta: qontoPaginationSchema.optional(),
});

export const qontoTransactionsEnvelopeSchema = z.object({
  transactions: z.array(qontoTransactionSchema).max(100),
  meta: qontoPaginationSchema,
});

export type QontoAccount = z.infer<typeof qontoAccountSchema>;
export type QontoTransaction = z.infer<typeof qontoTransactionSchema>;
