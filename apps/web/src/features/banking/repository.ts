import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { businessDateSchema } from "@/features/commercial-schema";
import { getQontoIntegration } from "@/features/integrations/repository";
import type { IntegrationState } from "@/features/integrations/status";

const idSchema = z.string().uuid();
const cents = z.number().int().safe();
const currency = z.string().regex(/^[A-Z]{3}$/);
const instant = z.string().datetime({ offset: true });
const accountSchema = z.object({
  id: idSchema, name: z.string(),
  iban_masked: z.string().regex(/^[A-Z]{2}[0-9]{2}•{7,26}[A-Z0-9]{4}$/).nullable(),
  currency, current_balance_cents: cents, available_balance_cents: cents.nullable(),
  status: z.enum(["active", "closed"]), updated_at: instant, is_current: z.boolean(),
});
const transactionSchema = z.object({
  id: idSchema, bank_account_id: idSchema, currency, amount_cents: cents.nonnegative(),
  direction: z.enum(["inflow", "outflow"]), status: z.enum(["pending", "completed", "declined", "reversed"]),
  label: z.string(), counterparty: z.string().nullable(), transaction_date: businessDateSchema,
  value_date: businessDateSchema.nullable(), updated_at: instant,
});
export type BankAccount = z.infer<typeof accountSchema>;
export type BankTransaction = z.infer<typeof transactionSchema>;
export type BankingSnapshot = { integration: IntegrationState | null; accounts: BankAccount[]; fullTransactions?: BankTransaction[] };
export type BankingReadOptions = { historyPage?: number; fullHistory?: { since: string; until: string }; signal?: AbortSignal };
export type TransactionHistory = { items: BankTransaction[]; page: number; hasNext: boolean };
const accountColumns = "id, name, iban_masked, currency, current_balance_cents, available_balance_cents, status, updated_at, is_current";
const transactionColumns = "id, bank_account_id, currency, amount_cents, direction, status, label, counterparty, transaction_date, value_date, updated_at";
const pageSchema = z.number().int().min(1).max(100_000);

export function parseBankPage(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return 1;
  const parsed = pageSchema.safeParse(Number(value));
  return parsed.success ? parsed.data : 1;
}

export async function listBankAccounts(client: SupabaseClient, ownerUserId: string, integrationId: string, signal = new AbortController().signal): Promise<BankAccount[]> {
  try {
    idSchema.parse(ownerUserId); idSchema.parse(integrationId);
    const rows: BankAccount[] = [];
    for (let from = 0; ; from += 1000) {
      signal.throwIfAborted();
      if (from > 100_000) throw new Error("DATABASE_ERROR");
      const { data, error } = await client.from("bank_accounts").select(accountColumns)
        .eq("owner_user_id", ownerUserId).eq("integration_id", integrationId)
        .order("id", { ascending: true })
        .abortSignal(signal).range(from, from + 999);
      if (error) throw new Error("DATABASE_ERROR");
      const page = z.array(accountSchema).parse(data); rows.push(...page);
      if (rows.length > 100_000) throw new Error("DATABASE_ERROR");
      if (page.length < 1000) return rows;
    }
  } catch { throw new Error("DATABASE_ERROR"); }
}

export function getBankingSnapshot(
  client: SupabaseClient,
  ownerUserId: string,
): Promise<BankingSnapshot>;
export function getBankingSnapshot(
  client: SupabaseClient,
  ownerUserId: string,
  options: BankingReadOptions & { historyPage: number },
): Promise<BankingSnapshot & { history: TransactionHistory }>;
export function getBankingSnapshot(client: SupabaseClient, ownerUserId: string, options: BankingReadOptions): Promise<BankingSnapshot & { history?: TransactionHistory }>;
export async function getBankingSnapshot(
  client: SupabaseClient,
  ownerUserId: string,
  options?: BankingReadOptions,
): Promise<BankingSnapshot & { history?: TransactionHistory }> {
  if (options?.historyPage !== undefined && !pageSchema.safeParse(options.historyPage).success) {
    throw new Error("DATABASE_ERROR");
  }

  const signal = options?.signal ?? AbortSignal.timeout(40_000);
  if (options?.fullHistory && (!businessDateSchema.safeParse(options.fullHistory.since).success
    || !businessDateSchema.safeParse(options.fullHistory.until).success || options.fullHistory.since > options.fullHistory.until)) throw new Error("DATABASE_ERROR");

  // Control, account and history GETs carry explicit signals to bypass Next
  // render memoization, including identical URLs on retries. These owner reads
  // run after cookies(), without fetch cache configuration (Next auto no-cache).
  // Publication changes accounts, transactions and last_success_at atomically.
  // Read the marker around the whole assembled view, retaining its PostgreSQL
  // precision (Date conversion would truncate microseconds). Discard every row
  // from an overlapping publication and retry the entire read, at most 3 times.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = await getQontoIntegration(client, ownerUserId, signal);
    const accounts = before?.last_success_at
      ? await listBankAccounts(client, ownerUserId, before.id, signal)
      : [];
    const history = options?.historyPage !== undefined
      ? before?.last_success_at
        ? await listBankTransactions(client, ownerUserId, before.id, options.historyPage, signal)
        : { items: [], page: 1, hasNext: false }
      : undefined;
    const fullTransactions = options?.fullHistory
      ? before?.last_success_at ? await listAllBankTransactions(client, ownerUserId, before.id, options.fullHistory, signal) : []
      : undefined;
    const after = await getQontoIntegration(client, ownerUserId, signal);

    if (before?.id === after?.id && before?.last_success_at === after?.last_success_at) {
      // A connection failure or a new in-flight sync does not change published
      // money. Show the latest control state without discarding that money.
      return { integration: after, accounts, ...(fullTransactions ? { fullTransactions } : {}), ...(history ? { history } : {}) };
    }
  }
  throw new Error("DATABASE_ERROR");
}

export async function listBankTransactions(client: SupabaseClient, ownerUserId: string, integrationId: string, page = 1, signal = new AbortController().signal): Promise<TransactionHistory> {
  try {
    idSchema.parse(ownerUserId); idSchema.parse(integrationId); pageSchema.parse(page);
    const from = (page - 1) * 50;
    const { data, error, count } = await client.from("bank_transactions")
      .select(transactionColumns, { count: "exact" }).eq("owner_user_id", ownerUserId).eq("integration_id", integrationId)
      .order("transaction_date", { ascending: false }).order("id", { ascending: false })
      .abortSignal(signal).range(from, from + 49);
    if (error) throw new Error("DATABASE_ERROR");
    return { items: z.array(transactionSchema).parse(data), page, hasNext: z.number().int().nonnegative().parse(count) > from + 50 };
  } catch { throw new Error("DATABASE_ERROR"); }
}

export async function listAllBankTransactions(client: SupabaseClient, ownerUserId: string, integrationId: string, window: { since: string; until: string }, signal: AbortSignal): Promise<BankTransaction[]> {
  try {
    idSchema.parse(ownerUserId); idSchema.parse(integrationId);
    businessDateSchema.parse(window.since); businessDateSchema.parse(window.until);
    const rows: BankTransaction[] = [];
    for (let from = 0; from <= 100_000; from += 1000) {
      signal.throwIfAborted();
      const { data, error } = await client.from("bank_transactions").select(transactionColumns)
        .eq("owner_user_id", ownerUserId).eq("integration_id", integrationId)
        .gte("transaction_date", window.since).lte("transaction_date", window.until)
        .order("id", { ascending: true }).abortSignal(signal).range(from, from + 999);
      if (error) throw new Error("DATABASE_ERROR");
      const page = z.array(transactionSchema).parse(data); rows.push(...page);
      if (rows.length > 100_000) throw new Error("DATABASE_ERROR");
      if (page.length < 1000) return rows;
    }
    throw new Error("DATABASE_ERROR");
  } catch { throw new Error("DATABASE_ERROR"); }
}
