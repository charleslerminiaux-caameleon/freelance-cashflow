// @vitest-environment node
import { localDate } from "@fc/shared";
import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { confirmRecurringFromTransaction, getHistoryRecurringWorkspace } from "./history-repository";
import { historyRecurringInputSchema } from "./history-schema";
import { paidMonthsByExpense } from "./forecast";
const owner = "11111111-1111-4111-8111-111111111111";
const integration = "22222222-2222-4222-8222-222222222222";
const transaction = "33333333-3333-4333-8333-333333333333";
const expense = "44444444-4444-4444-8444-444444444444";
const publication = "2026-09-11T10:00:00.123456Z";
const command = { label: " Cloud ", amount_cents: 1200, day_of_month: 10, start_date: localDate("2026-10-10"), cashflow_kind: "expense" as const, certainty: "committed" as const, probability_basis_points: 10000 };
const tx = { id: transaction, owner_user_id: owner, integration_id: integration, bank_account_id: owner, label: " Clöud ", amount_cents: 1000, currency: "EUR", direction: "outflow" as const, status: "completed", transaction_date: localDate("2026-09-05") };
function clientFor(transport: (url: URL, init?: RequestInit) => unknown) {
  return createClient("http://127.0.0.1:56321", "fake-check-anon", { auth: { persistSession: false }, global: { fetch: async (input, init) => (async () => { const result = await transport(new URL(String(input)), init); return result instanceof Response ? result : new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } }); })() } });
}
function rows(url: URL): unknown {
  switch (url.pathname.split("/").at(-1)) {
    case "integrations": return { provider: "qonto", id: integration, status: "connected", last_success_at: publication, last_connection_succeeded: true, last_error_code: null };
    case "app_settings": return { owner_user_id: owner, currency: "EUR", timezone: "Europe/Paris" };
    case "bank_transactions": return tx;
    case "bank_accounts": return { id: owner, owner_user_id: owner, integration_id: integration, status: "active", is_current: true, currency: "EUR" };
    case "recurring_suggestions": return [];
    case "recurring_cashflows": return [{ id: expense, owner_user_id: owner, label: "CLOUD", amount_cents: 1050 }];
    case "cashflow_categories": return [{ id: expense, owner_user_id: owner, name: "Tools", type: "outflow" }];
  }
  throw new Error("Unexpected request");
}
afterEach(() => vi.useRealTimers());
it("sends exact owner-authenticated history RPC arguments and trims command", async () => {
  let payload: unknown;
  const client = clientFor((url, init) => { expect(url.pathname).toContain("rpc/confirm_recurring_from_transaction"); payload = JSON.parse(String(init?.body)); return expense; });
  expect(await confirmRecurringFromTransaction(client, owner, { transactionId: transaction, sourcePublication: publication, command, allowRecreate: true })).toBe(expense);
  expect(payload).toEqual({ p_transaction_id: transaction, p_source_publication: publication, p_command: { ...command, label: "Cloud" }, p_existing_expense_id: null, p_allow_duplicate: false, p_allow_recreate: true });
});
it("rejects unsafe cents and unknown owner fields before transport", async () => {
  let calls = 0; const client = clientFor(() => { calls++; return expense; });
  await expect(confirmRecurringFromTransaction(client, owner, { transactionId: transaction, sourcePublication: publication, command: { ...command, amount_cents: Number.MAX_SAFE_INTEGER + 1 } })).rejects.toThrow(/^DETECTION_INVALID$/);
  expect(historyRecurringInputSchema.safeParse({ transactionId: transaction, sourcePublication: publication, command, owner }).success).toBe(false);
  expect(calls).toBe(0);
});
it("sanitizes unknown errors and retains stable stale codes", async () => {
  const input = { transactionId: transaction, sourcePublication: publication, command };
  await expect(confirmRecurringFromTransaction(clientFor(() => { throw new Error("private canary"); }), owner, input)).rejects.toThrow(/^DATABASE_ERROR$/);
  await expect(confirmRecurringFromTransaction(clientFor(() => new Response(JSON.stringify({ message: "DETECTION_STALE", code: "P0001" }), { status: 400, headers: { "Content-Type": "application/json" } })), owner, input)).rejects.toThrow(/^DETECTION_STALE$/);
});
it("assembles an owner-scoped publication-coherent whitelisted workspace", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-12T10:00:00Z"));
  let markers = 0;
  const client = clientFor((url, init) => {
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(url.searchParams.get("owner_user_id")).toBe(`eq.${owner}`);
    if (url.pathname.endsWith("integrations")) markers++;
    return rows(url);
  });
  expect(await getHistoryRecurringWorkspace(client, owner, transaction)).toEqual({ transactionId: transaction, sourcePublication: publication, label: "Clöud", amountCents: 1000, dayOfMonth: 5, nextDate: "2026-10-05", currency: "EUR", seriesState: null, linkedExpenseId: null, possibleDuplicates: [{ id: expense, label: "CLOUD", amountCents: 1050 }], existingExpenses: [{ id: expense, label: "CLOUD", amountCents: 1050 }], categories: [{ id: expense, name: "Tools" }] });
  expect(markers).toBe(2);
});
it.each([{ amount_cents: 0 }, { direction: "inflow" }, { status: "pending" }, { status: "reversed" }, { currency: "USD" }, { transaction_date: "2099-01-01" }])("rejects ineligible transaction %j", async patch => {
  await expect(getHistoryRecurringWorkspace(clientFor(url => url.pathname.endsWith("bank_transactions") ? { ...tx, ...patch } : rows(url)), owner, transaction)).rejects.toThrow(/^DETECTION_INVALID$/);
});
it("rejects foreign rows even when transport ignores filters", async () => {
  await expect(getHistoryRecurringWorkspace(clientFor(url => url.pathname.endsWith("bank_transactions") ? { ...tx, owner_user_id: expense } : rows(url)), owner, transaction)).rejects.toThrow(/^DATABASE_ERROR$/);
});
it("retries all reads after a microsecond publication change", async () => {
  let markers = 0; let txReads = 0;
  const changed = "2026-09-11T10:00:00.123457Z";
  const client = clientFor(url => {
    if (url.pathname.endsWith("integrations")) return { ...rows(url) as object, last_success_at: ++markers === 1 ? publication : changed };
    if (url.pathname.endsWith("bank_transactions")) txReads++;
    return rows(url);
  });
  expect((await getHistoryRecurringWorkspace(client, owner, transaction)).sourcePublication).toBe(changed);
  expect(txReads).toBe(3);
});
it("preserves full series identity and truncates display without splitting astral characters", async () => {
  const label = "😀".repeat(79) + "ab😀";
  const client = clientFor(url => url.pathname.endsWith("bank_transactions") ? { ...tx, label } : rows(url));
  expect((await getHistoryRecurringWorkspace(client, owner, transaction)).label).toBe("😀".repeat(79) + "ab");
});
it("one selected proof excludes its paid month using observed amount, reversed stops excluding", () => {
  const series = [{ state: "confirmed" as const, linkedExpenseId: expense, accountId: owner, currency: "EUR", normalizedLabel: "cloud", amountCents: 1000 }];
  expect(paidMonthsByExpense(series, [tx])).toEqual({ [expense]: ["2026-09"] });
  expect(paidMonthsByExpense(series, [{ ...tx, status: "reversed" }])).toEqual({ [expense]: [] });
});
it.each([{ is_current: false }, { status: "closed" }, { currency: "USD" }])("rejects ineligible account %j", async patch => {
  await expect(getHistoryRecurringWorkspace(clientFor(url => url.pathname.endsWith("bank_accounts") ? { ...rows(url) as object, ...patch } : rows(url)), owner, transaction)).rejects.toThrow(/^DETECTION_INVALID$/);
});
it("returns existing series decision and excludes linked charges from choices", async () => {
  const client = clientFor(url => url.pathname.endsWith("recurring_suggestions") ? [{ owner_user_id: owner, integration_id: integration, bank_account_id: owner, currency: "EUR", normalized_label: "cloud", state: "confirmed", recurring_cashflow_id: expense }] : rows(url));
  expect(await getHistoryRecurringWorkspace(client, owner, transaction)).toMatchObject({ seriesState: "confirmed", linkedExpenseId: expense, possibleDuplicates: [], existingExpenses: [] });
});
it("bounds publication churn and sanitizes malformed upstream data", async () => {
  let markers = 0;
  const client = clientFor(url => url.pathname.endsWith("integrations") ? { ...rows(url) as object, last_success_at: `2026-09-11T10:00:00.12345${++markers}Z` } : rows(url));
  await expect(getHistoryRecurringWorkspace(client, owner, transaction)).rejects.toThrow(/^DETECTION_STALE$/);
  expect(markers).toBe(6);
  await expect(getHistoryRecurringWorkspace(clientFor(url => url.pathname.endsWith("app_settings") ? { ...rows(url) as object, timezone: "invalid canary" } : rows(url)), owner, transaction)).rejects.toThrow(/^DATABASE_ERROR$/);
});
it("uses owner timezone across UTC midnight and advances beyond paid month", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-30T23:30:00Z"));
  expect((await getHistoryRecurringWorkspace(clientFor(url => url.pathname.endsWith("bank_transactions") ? { ...tx, transaction_date: localDate("2026-09-01") } : rows(url)), owner, transaction)).nextDate).toBe("2026-11-01");
});
it("reads choices beyond the first PostgREST page", async () => {
  let reads = 0;
  const client = clientFor(url => {
    if (url.pathname.endsWith("recurring_cashflows")) {
      reads++;
      return url.searchParams.get("offset") === "0" ? Array.from({ length: 1000 }, () => ({ id: expense, owner_user_id: owner, label: "Unrelated", amount_cents: 1000 })) : rows(url);
    }
    return rows(url);
  });
  const workspace = await getHistoryRecurringWorkspace(client, owner, transaction);
  expect(reads).toBe(2); expect(workspace.existingExpenses).toHaveLength(1001);
  expect(workspace.possibleDuplicates).toEqual([{ id: expense, label: "CLOUD", amountCents: 1050 }]);
});

it.each(["revolut", "bunq"])("loads history from the selected transaction's %s integration", async provider => {
  const client = clientFor(url => {
    if (url.pathname.endsWith("integrations")) {
      expect(url.searchParams.get("id")).toBe(`eq.${integration}`);
      expect(url.searchParams.get("provider")).toBe("in.(qonto,revolut,bunq)");
      return {...rows(url) as object, provider};
    }
    return rows(url);
  });
  expect((await getHistoryRecurringWorkspace(client, owner, transaction)).transactionId).toBe(transaction);
});

it("excludes expenses linked to another bank without borrowing its series decision", async () => {
  const client = clientFor(url => {
    if (url.pathname.endsWith("integrations")) return { ...rows(url) as object, provider: "revolut" };
    if (url.pathname.endsWith("recurring_suggestions")) {
      if (url.searchParams.has("integration_id")) return [];
      return [{ owner_user_id: owner, recurring_cashflow_id: expense }];
    }
    return rows(url);
  });
  expect(await getHistoryRecurringWorkspace(client, owner, transaction)).toMatchObject({
    seriesState: null, linkedExpenseId: null, existingExpenses: [], possibleDuplicates: [],
  });
});
