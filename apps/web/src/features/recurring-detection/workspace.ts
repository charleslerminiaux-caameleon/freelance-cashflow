import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeRecurringLabel } from "@fc/domain";
import { z } from "zod";
import { getQontoIntegration } from "@/features/integrations/repository";
import { businessDateSchema } from "@/features/commercial-schema";
import { detectionCodeSchema, publicationSchema, suggestionRowSchema, uuid, type SuggestionRow, type RecurringSuggestion, type RecurringSuggestionWorkspace } from "./schema";

const columns = "id, owner_user_id, integration_id, bank_account_id, currency, normalized_label, state, eligible, label, amount_cents, day_of_month, last_payment_date, next_date, source_publication, recurring_cashflow_id";
async function pages<T>(fetchPage: (from: number, to: number) => Promise<T[]>): Promise<T[]> {
  const result: T[] = [];
  for (let from = 0; from <= 100_000; from += 1000) {
    const page = await fetchPage(from, from + 999); result.push(...page);
    if (result.length > 100_000) throw new Error("DATABASE_ERROR");
    if (page.length < 1000) return result;
  }
  throw new Error("DATABASE_ERROR");
}
async function listRows(client: SupabaseClient, owner: string, integration: string, signal: AbortSignal, confirmedOnly = false): Promise<SuggestionRow[]> {
  return pages(async (from, to) => {
    let query = client.from("recurring_suggestions").select(columns).eq("owner_user_id", owner).eq("integration_id", integration);
    if (confirmedOnly) query = query.eq("state", "confirmed");
    const { data, error } = await query.order("id").abortSignal(signal).range(from, to);
    if (error) throw new Error("DATABASE_ERROR");
    const rows = z.array(suggestionRowSchema).parse(data);
    if (rows.some(row => row.owner_user_id !== owner || row.integration_id !== integration)) throw new Error("DATABASE_ERROR");
    return rows;
  });
}
function suggestion(row: SuggestionRow): RecurringSuggestion {
  return { id: row.id, accountId: row.bank_account_id, currency: row.currency, normalizedLabel: row.normalized_label,
    state: row.state, eligible: row.eligible, label: row.label, amountCents: row.amount_cents, dayOfMonth: row.day_of_month,
    nextDate: row.next_date, lastPaymentDate: row.last_payment_date, sourcePublication: row.source_publication,
    linkedExpenseId: row.recurring_cashflow_id, evidence: [], possibleDuplicates: [] };
}
export async function listConfirmedRecurringSuggestions(client: SupabaseClient, owner: string, integration: string): Promise<RecurringSuggestion[]> {
  try { uuid.parse(owner); uuid.parse(integration); return (await listRows(client, owner, integration, AbortSignal.timeout(40_000), true)).map(suggestion); }
  catch { throw new Error("DATABASE_ERROR"); }
}
const expenseSchema = z.object({ id: uuid, owner_user_id: uuid, label: z.string(), amount_cents: z.number().int().safe().positive() });
const evidenceSchema = z.object({ suggestion_id: uuid, transaction_id: uuid, transaction: z.object({ id: uuid, owner_user_id: uuid, integration_id: uuid, label: z.string(), amount_cents: z.number().int().safe().nonnegative(), transaction_date: businessDateSchema }) });
export async function getRecurringSuggestionWorkspace(client: SupabaseClient, owner: string): Promise<RecurringSuggestionWorkspace> {
  try {
    uuid.parse(owner); const signal = AbortSignal.timeout(40_000);
    const integration = await getQontoIntegration(client, owner, signal);
    const empty = { suggestions: [], ignored: [], linkedExpenseIds: [], lastAnalyzedAt: null, analysisError: null };
    if (!integration) return empty;
    const [rows, expenses, evidence, runResult] = await Promise.all([
      listRows(client, owner, integration.id, signal),
      pages(async (from, to) => {
        const { data, error } = await client.from("recurring_cashflows").select("id, owner_user_id, label, amount_cents")
          .eq("owner_user_id", owner).eq("direction", "outflow").eq("cashflow_kind", "expense").eq("frequency", "monthly")
          .order("id").abortSignal(signal).range(from, to);
        if (error) throw new Error("DATABASE_ERROR");
        return z.array(expenseSchema).parse(data);
      }),
      pages(async (from, to) => {
        const { data, error } = await client.from("recurring_suggestion_evidence")
          .select("suggestion_id, transaction_id, transaction:bank_transactions!inner(id, owner_user_id, integration_id, label, amount_cents, transaction_date)")
          .eq("owner_user_id", owner).eq("integration_id", integration.id)
          .order("suggestion_id").order("transaction_id").abortSignal(signal).range(from, to);
        if (error) throw new Error("DATABASE_ERROR");
        return z.array(evidenceSchema).parse(data);
      }),
      client.from("recurring_detection_runs").select("last_success_at, last_error_code").eq("owner_user_id", owner)
        .eq("integration_id", integration.id).abortSignal(signal).maybeSingle(),
    ]);
    if (runResult.error || expenses.some(row => row.owner_user_id !== owner)
      || evidence.some(row => row.transaction.owner_user_id !== owner || row.transaction.integration_id !== integration.id || row.transaction.id !== row.transaction_id)) throw new Error("DATABASE_ERROR");
    const run = runResult.data === null ? null : z.object({ last_success_at: publicationSchema.nullable(), last_error_code: detectionCodeSchema.nullable() }).parse(runResult.data);
    const linked = new Set(rows.flatMap(row => row.recurring_cashflow_id ? [row.recurring_cashflow_id] : []));
    const evidenceById = new Map<string, RecurringSuggestion["evidence"]>();
    for (const item of evidence) {
      const list = evidenceById.get(item.suggestion_id) ?? [];
      list.push({ id: item.transaction.id, label: item.transaction.label, amountCents: item.transaction.amount_cents, transactionDate: item.transaction.transaction_date });
      evidenceById.set(item.suggestion_id, list);
    }
    const candidates = rows.filter(row => row.state !== "confirmed").map(row => ({ ...suggestion(row),
      evidence: (evidenceById.get(row.id) ?? []).sort((a, b) => a.transactionDate.localeCompare(b.transactionDate) || a.id.localeCompare(b.id)),
      possibleDuplicates: expenses.filter(expense => !linked.has(expense.id) && normalizeRecurringLabel(expense.label) === row.normalized_label
        && BigInt(Math.abs(expense.amount_cents - row.amount_cents)) * 10n <= BigInt(row.amount_cents))
        .map(expense => ({ id: expense.id, label: expense.label, amountCents: expense.amount_cents })),
    }));
    return { suggestions: candidates.filter(row => row.state === "pending"), ignored: candidates.filter(row => row.state === "dismissed"),
      linkedExpenseIds: [...linked], lastAnalyzedAt: run?.last_success_at ?? null, analysisError: run?.last_error_code ?? null };
  } catch { throw new Error("DATABASE_ERROR"); }
}
