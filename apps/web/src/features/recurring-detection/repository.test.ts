// @vitest-environment node
import { localDate } from "@fc/shared";
import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { confirmSuggestion, setSuggestionState, getRecurringSuggestionWorkspace, createAnalysisStore } from "./repository";
const owner = "11111111-1111-4111-8111-111111111111";
const integration = "22222222-2222-4222-8222-222222222222";
const suggestion = "33333333-3333-4333-8333-333333333333";
const linked = "44444444-4444-4444-8444-444444444444";
const publication = "2026-09-11T10:00:00.123456Z";
const row = { id: suggestion, owner_user_id: owner, integration_id: integration, bank_account_id: owner, currency: "EUR", normalized_label: "cloud", state: "pending", eligible: true, label: "Cloud", amount_cents: 1000, day_of_month: 5, last_payment_date: "2026-09-05", next_date: "2026-10-05", source_publication: publication, recurring_cashflow_id: null };
function clientFor(transport: (url: URL, init?: RequestInit) => unknown) {
  return createClient("https://example.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => new Response(JSON.stringify(await transport(new URL(String(input)), init)), { headers: { "Content-Type": "application/json" } }) } });
}
it("maps validated confirmation to owner-authenticated SQL payload without accepting owner from command", async () => {
  let payload: unknown;
  const client = clientFor((url, init) => { expect(url.pathname).toContain("rpc/confirm_recurring_suggestion"); payload = JSON.parse(String(init?.body)); return linked; });
  const input = { suggestionId: suggestion, sourcePublication: publication, command: { label: " Cloud ", amount_cents: 1200, day_of_month: 10, start_date: localDate("2026-10-10"), cashflow_kind: "expense" as const, certainty: "certain" as const, probability_basis_points: 10000 }, allowDuplicate: true };
  expect(await confirmSuggestion(client, owner, input)).toBe(linked);
  expect(payload).toEqual({ p_suggestion_id: suggestion, p_source_publication: publication, p_command: { ...input.command, label: "Cloud" }, p_existing_expense_id: null, p_allow_duplicate: true });
  await expect(confirmSuggestion(client, owner, { ...input, command: { ...input.command, amount_cents: -1 } })).rejects.toThrow(/^DETECTION_INVALID$/);
});
it("sanitizes unexpected transport errors for decisions", async () => {
  const client = clientFor(() => { throw new Error("private canary"); });
  await expect(setSuggestionState(client, owner, suggestion, "dismiss")).rejects.toThrow(/^DATABASE_ERROR$/);
});
it("loads paginated suggestions, ignored list, owned safe evidence, duplicate matches and confirmed origin IDs", async () => {
  const client = clientFor((url, init) => {
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(url.searchParams.get("owner_user_id")).toBe(`eq.${owner}`);
    const table = url.pathname.split("/").at(-1);
    if (table === "integrations") return { id: integration, status: "connected", last_success_at: publication, last_connection_succeeded: true, last_error_code: null };
    if (table === "recurring_detection_runs") return { lease_run_id: null, lease_expires_at: null, analyzed_publication: publication, last_success_at: publication, last_error_code: "DATABASE_ERROR" };
    if (table === "recurring_cashflows") return [{ id: linked, owner_user_id: owner, label: "CLOUD", amount_cents: 1050 }];
    expect(url.searchParams.get("integration_id")).toBe(`eq.${integration}`);
    if (table === "recurring_suggestions") return Number(url.searchParams.get("offset")) === 0 ? Array.from({ length: 1000 }, (_, i) => ({ ...row, id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` })) : [{ ...row, state: "dismissed" }, { ...row, id: owner, state: "confirmed", recurring_cashflow_id: owner }];
    expect(url.searchParams.get("select")).not.toContain("*");
    return [{ suggestion_id: "00000000-0000-4000-8000-000000000000", transaction_id: owner, transaction: { id: owner, owner_user_id: owner, integration_id: integration, label: "Cloud", amount_cents: 1000, transaction_date: "2026-09-05" } }];
  });
  const workspace = await getRecurringSuggestionWorkspace(client, owner);
  expect(workspace.suggestions).toHaveLength(1000);
  expect(workspace.ignored).toHaveLength(1);
  expect(workspace.linkedExpenseIds).toEqual([owner]);
  expect(workspace.suggestions[0]).toMatchObject({ evidence: [{ id: owner, label: "Cloud", amountCents: 1000, transactionDate: "2026-09-05" }], possibleDuplicates: [{ id: linked, label: "CLOUD", amountCents: 1050 }] });
  expect(workspace.analysisError).toBe("DATABASE_ERROR");
  expect(workspace.lastAnalyzedAt).toBe(publication);
});
it("uses exact service-role RPC names and preserves candidate identity and observed data", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const client = clientFor((url, init) => { const name = url.pathname.split("/").at(-1)!; calls.push({ name, payload: JSON.parse(String(init?.body)) }); return name === "acquire_recurring_analysis" ? { integration_id: integration, source_publication: publication, lease_expires_at: publication } : null; });
  const store = createAnalysisStore(client); const signal = new AbortController().signal;
  expect(await store.acquire(owner, linked, signal)).toMatchObject({ integrationId: integration, sourcePublication: publication });
  await store.publish(owner, linked, publication, [{ accountId: owner, currency: "EUR", normalizedLabel: "cloud", label: "Cloud", amountCents: 1000, dayOfMonth: 5, lastPaymentDate: "2026-09-05", nextDate: "2026-10-05", transactionIds: [owner, linked, suggestion] }], signal);
  expect(calls[1]).toEqual({ name: "publish_recurring_analysis", payload: { p_owner_user_id: owner, p_run_id: linked, p_source_publication: publication, p_candidates: [{ account_id: owner, currency: "EUR", normalized_label: "cloud", label: "Cloud", amount_cents: 1000, day_of_month: 5, last_payment_date: "2026-09-05", next_date: "2026-10-05", transaction_ids: [owner, linked, suggestion] }] } });
});
it("refuses foreign evidence even if an upstream transport violates owner filtering", async () => {
  const client = clientFor(url => {
    const table = url.pathname.split("/").at(-1);
    if (table === "integrations") return { id: integration, status: "connected", last_success_at: publication, last_connection_succeeded: true, last_error_code: null };
    if (table === "recurring_detection_runs") return null;
    if (table === "recurring_suggestions") return [row];
    if (table === "recurring_cashflows") return [];
    return [{ suggestion_id: suggestion, transaction_id: linked, transaction: { id: linked, owner_user_id: linked, integration_id: integration, label: "Synthetic", amount_cents: 1000, transaction_date: "2026-09-05" } }];
  });
  await expect(getRecurringSuggestionWorkspace(client, owner)).rejects.toThrow(/^DATABASE_ERROR$/);
});
it("returns an empty review workspace when there is no integration", async () => {
  const client = clientFor(() => null);
  expect(await getRecurringSuggestionWorkspace(client, owner)).toEqual({ suggestions: [], ignored: [], linkedExpenseIds: [], lastAnalyzedAt: null, analysisError: null });
});

it("groups duplicate discovery by normalized label once across pending and ignored series", async () => {
  const otherExpense = "55555555-5555-4555-8555-555555555555";
  const ignoredId = "66666666-6666-4666-8666-666666666666";
  const client = clientFor(url => {
    const table = url.pathname.split("/").at(-1);
    if (table === "integrations") return { id: integration, status: "connected", last_success_at: publication, last_connection_succeeded: true, last_error_code: null };
    if (table === "recurring_detection_runs") return null;
    if (table === "recurring_suggestions") return [row, { ...row, id: owner, label: "Other", normalized_label: "other" }, { ...row, id: ignoredId, state: "dismissed" }, { ...row, id: integration, state: "confirmed", recurring_cashflow_id: linked }];
    if (table === "recurring_cashflows") return [
      { id: owner, owner_user_id: owner, label: "CLOUD", amount_cents: 1100 },
      { id: otherExpense, owner_user_id: owner, label: "Óther", amount_cents: 900 },
      { id: suggestion, owner_user_id: owner, label: "Cloud", amount_cents: 1101 },
      { id: linked, owner_user_id: owner, label: "Cloud", amount_cents: 1000 },
    ];
    return [];
  });
  // An operation budget detects repeated normalization without machine-dependent
  // wall-clock assertions. The real normalizer still computes every result.
  const normalize = String.prototype.normalize;
  let normalizations = 0;
  const spy = vi.spyOn(String.prototype, "normalize").mockImplementation(function (this: string, form?: string) {
    if (++normalizations > 3) throw new Error("NORMALIZATION_BUDGET_EXHAUSTED");
    return normalize.call(this, form);
  });
  try {
    const workspace = await getRecurringSuggestionWorkspace(client, owner);
    expect(workspace.suggestions.map(item => item.possibleDuplicates.map(expense => expense.id))).toEqual([[owner], [otherExpense]]);
    expect(workspace.ignored[0]?.possibleDuplicates.map(expense => expense.id)).toEqual([owner]);
    expect(workspace.linkedExpenseIds).toEqual([linked]);
  } finally { spy.mockRestore(); }
});
