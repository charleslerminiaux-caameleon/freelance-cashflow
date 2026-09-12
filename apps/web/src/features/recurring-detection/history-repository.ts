import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nextRecurringDate, normalizeRecurringLabel, suggestedRecurringLabel } from "@fc/domain";
import { z } from "zod";
import { businessDateSchema } from "@/features/commercial-schema";
import { getQontoIntegration } from "@/features/integrations/repository";
import { detectionErrorCode, uuid } from "./schema";
import { historyRecurringInputSchema, historyRecurringWorkspaceSchema, type HistoryRecurringInput, type HistoryRecurringWorkspace } from "./history-schema";

export async function confirmRecurringFromTransaction(client: SupabaseClient, ownerUserId: string, input: HistoryRecurringInput): Promise<string> {
  const parsed = historyRecurringInputSchema.safeParse(input);
  if (!uuid.safeParse(ownerUserId).success || !parsed.success) throw new Error("DETECTION_INVALID");
  const value = parsed.data;
  try {
    const { data, error } = await client.rpc("confirm_recurring_from_transaction", {
      p_transaction_id: value.transactionId, p_source_publication: value.sourcePublication,
      p_command: value.command, p_existing_expense_id: value.existingExpenseId ?? null,
      p_allow_duplicate: value.allowDuplicate ?? false, p_allow_recreate: value.allowRecreate ?? false,
    });
    if (error) throw error;
    return uuid.parse(data);
  } catch (error) { throw new Error(detectionErrorCode(error)); }
}
const scope = { owner_user_id: uuid, integration_id: uuid };
const currency = z.string().regex(/^[A-Z]{3}$/);
const transactionSchema = z.object({ ...scope, id: uuid, bank_account_id: uuid, label: z.string(), amount_cents: z.number().int().safe().nonnegative(), currency,
  direction: z.enum(["inflow", "outflow"]), status: z.enum(["completed", "pending", "declined", "reversed"]), transaction_date: businessDateSchema });
const accountSchema = z.object({ ...scope, id: uuid, currency, status: z.enum(["active", "closed"]), is_current: z.boolean() });
const settingsSchema = z.object({ owner_user_id: uuid, currency, timezone: z.string() });
const seriesSchema = z.object({ ...scope, bank_account_id: uuid, currency, normalized_label: z.string(), state: z.enum(["pending", "confirmed", "dismissed"]), recurring_cashflow_id: uuid.nullable() });
const expenseSchema = z.object({ id: uuid, owner_user_id: uuid, label: z.string(), amount_cents: z.number().int().safe().positive() });
const categorySchema = z.object({ id: uuid, owner_user_id: uuid, name: z.string(), type: z.enum(["outflow", "both"]) });
async function pages<T>(fetchPage: (from: number, to: number) => Promise<T[]>): Promise<T[]> {
  const result: T[] = [];
  for (let from = 0; from <= 100_000; from += 1000) {
    const page = await fetchPage(from, from + 999); result.push(...page);
    if (result.length > 100_000) throw new Error("DATABASE_ERROR");
    if (page.length < 1000) return result;
  }
  throw new Error("DATABASE_ERROR");
}
export async function getHistoryRecurringWorkspace(client: SupabaseClient, ownerUserId: string, transactionId: string): Promise<HistoryRecurringWorkspace> {
  if (!uuid.safeParse(ownerUserId).success || !uuid.safeParse(transactionId).success) throw new Error("DETECTION_INVALID");
  const signal = AbortSignal.timeout(40_000);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await getQontoIntegration(client, ownerUserId, signal);
      if (!before?.last_success_at) throw new Error("DETECTION_SOURCE_UNAVAILABLE");
      const [transactionResult, settingsResult, series, expenses, categories] = await Promise.all([
        client.from("bank_transactions").select("id, owner_user_id, integration_id, bank_account_id, label, amount_cents, currency, direction, status, transaction_date")
          .eq("owner_user_id", ownerUserId).eq("integration_id", before.id).eq("id", transactionId).abortSignal(signal).maybeSingle(),
        client.from("app_settings").select("owner_user_id, currency, timezone").eq("owner_user_id", ownerUserId).abortSignal(signal).single(),
        pages(async (from, to) => {
          const { data, error } = await client.from("recurring_suggestions").select("owner_user_id, integration_id, bank_account_id, currency, normalized_label, state, recurring_cashflow_id")
            .eq("owner_user_id", ownerUserId).eq("integration_id", before.id).order("id").abortSignal(signal).range(from, to);
          if (error) throw error; return z.array(seriesSchema).parse(data);
        }),
        pages(async (from, to) => {
          const { data, error } = await client.from("recurring_cashflows").select("id, owner_user_id, label, amount_cents")
            .eq("owner_user_id", ownerUserId).eq("direction", "outflow").eq("cashflow_kind", "expense").eq("frequency", "monthly").order("id").abortSignal(signal).range(from, to);
          if (error) throw error; return z.array(expenseSchema).parse(data);
        }),
        pages(async (from, to) => {
          const { data, error } = await client.from("cashflow_categories").select("id, owner_user_id, name, type")
            .eq("owner_user_id", ownerUserId).in("type", ["outflow", "both"]).order("id").abortSignal(signal).range(from, to);
          if (error) throw error; return z.array(categorySchema).parse(data);
        }),
      ]);
      if (transactionResult.error || settingsResult.error) throw new Error("DATABASE_ERROR");
      const tx = transactionResult.data === null ? null : transactionSchema.parse(transactionResult.data);
      const settings = settingsSchema.parse(settingsResult.data);
      const accountResult = tx ? await client.from("bank_accounts").select("id, owner_user_id, integration_id, currency, status, is_current")
        .eq("owner_user_id", ownerUserId).eq("integration_id", before.id).eq("id", tx.bank_account_id).abortSignal(signal).maybeSingle() : { data: null, error: null };
      if (accountResult.error) throw new Error("DATABASE_ERROR");
      const account = accountResult.data === null ? null : accountSchema.parse(accountResult.data);
      const after = await getQontoIntegration(client, ownerUserId, signal);
      if (before.id !== after?.id || before.last_success_at !== after.last_success_at) continue;
      if (!tx) throw new Error("DETECTION_NOT_FOUND");
      if (settings.owner_user_id !== ownerUserId || tx.id !== transactionId || tx.owner_user_id !== ownerUserId || tx.integration_id !== before.id
        || (account && (account.id !== tx.bank_account_id || account.owner_user_id !== ownerUserId || account.integration_id !== before.id))
        || series.some(row => row.owner_user_id !== ownerUserId || row.integration_id !== before.id)
        || expenses.some(row => row.owner_user_id !== ownerUserId) || categories.some(row => row.owner_user_id !== ownerUserId)) throw new Error("DATABASE_ERROR");
      const today = businessDateSchema.parse(new Intl.DateTimeFormat("sv-SE", { timeZone: settings.timezone }).format(new Date()));
      const normalized = normalizeRecurringLabel(tx.label);
      if (!account || !account.is_current || account.status !== "active" || account.currency !== settings.currency || tx.currency !== settings.currency
        || tx.amount_cents <= 0 || tx.direction !== "outflow" || tx.status !== "completed" || tx.transaction_date > today || !normalized) throw new Error("DETECTION_INVALID");
      const matches = series.filter(row => row.bank_account_id === tx.bank_account_id && row.currency === tx.currency && row.normalized_label === normalized);
      if (matches.length > 1) throw new Error("DATABASE_ERROR");
      const match = matches[0];
      const linked = new Set(series.flatMap(row => row.recurring_cashflow_id ? [row.recurring_cashflow_id] : []));
      const available = expenses.filter(row => !linked.has(row.id));
      const shapeExpense = (row: z.infer<typeof expenseSchema>) => ({ id: row.id, label: row.label, amountCents: row.amount_cents });
      const dayOfMonth = Number(tx.transaction_date.slice(8, 10));
      return historyRecurringWorkspaceSchema.parse({
        transactionId: tx.id, sourcePublication: before.last_success_at, label: suggestedRecurringLabel(tx.label), amountCents: tx.amount_cents,
        dayOfMonth, nextDate: nextRecurringDate(dayOfMonth, tx.transaction_date, today), currency: tx.currency,
        seriesState: match?.state ?? null, linkedExpenseId: match?.recurring_cashflow_id ?? null,
        possibleDuplicates: available.filter(row => normalizeRecurringLabel(row.label) === normalized && BigInt(Math.abs(row.amount_cents - tx.amount_cents)) * 10n <= BigInt(tx.amount_cents)).map(shapeExpense),
        existingExpenses: available.map(shapeExpense), categories: categories.map(row => ({ id: row.id, name: row.name })),
      });
    }
    throw new Error("DETECTION_STALE");
  } catch (error) { throw new Error(detectionErrorCode(error)); }
}
