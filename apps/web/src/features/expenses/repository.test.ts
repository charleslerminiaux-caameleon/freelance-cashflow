import type { SupabaseClient } from "@supabase/supabase-js";
import { localDate, moneyCents } from "@fc/shared";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createCategory,
  createPlannedExpense,
  createRecurringExpense,
  deletePlannedExpense,
  listExpenseWorkspace,
  updateRecurringExpense,
} from "./repository";
import { RepositoryError } from "../repository-error";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const expenseId = "22222222-2222-4222-8222-222222222222";
const categoryId = "33333333-3333-4333-8333-333333333333";

type QueryResult = { data: unknown; error: unknown };

function query(result: QueryResult) {
  const chain = {
    delete: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    insert: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    order: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
    update: vi.fn(),
    then: (
      onFulfilled: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  for (const method of [
    chain.delete,
    chain.eq,
    chain.in,
    chain.insert,
    chain.order,
    chain.select,
    chain.update,
  ]) {
    method.mockReturnValue(chain);
  }
  return chain;
}

function clientWith(results: Partial<Record<"cashflow_categories" | "recurring_cashflows" | "planned_cashflows", QueryResult>> = {}) {
  const queries = {
    cashflow_categories: query(results.cashflow_categories ?? { data: [], error: null }),
    recurring_cashflows: query(results.recurring_cashflows ?? { data: [], error: null }),
    planned_cashflows: query(results.planned_cashflows ?? { data: [], error: null }),
  };
  return {
    client: {
      from: vi.fn((table: keyof typeof queries) => queries[table]),
    } as unknown as SupabaseClient,
    queries,
  };
}

const recurringCommand = {
  label: "Rémunération",
  categoryId,
  cashflowKind: "remuneration" as const,
  amountCents: moneyCents(350_000),
  frequency: "monthly" as const,
  dayOfMonth: 5,
  startDate: localDate("2026-09-05"),
  endDate: null,
  certainty: "certain" as const,
  probabilityBasisPoints: 10_000,
  active: true,
};

const plannedCommand = {
  label: "Réserve Urssaf",
  categoryId,
  cashflowKind: "reserve" as const,
  amountCents: moneyCents(120_000),
  plannedDate: localDate("2026-10-15"),
  certainty: "committed" as const,
  probabilityBasisPoints: 10_000,
  status: "planned" as const,
};

describe("expense repositories", () => {
  it("scopes every workspace list to the owner", async () => {
    const { client, queries } = clientWith();

    await listExpenseWorkspace(client, ownerUserId);

    expect(queries.cashflow_categories.eq).toHaveBeenCalledWith("owner_user_id", ownerUserId);
    expect(queries.recurring_cashflows.eq).toHaveBeenCalledWith("owner_user_id", ownerUserId);
    expect(queries.planned_cashflows.eq).toHaveBeenCalledWith("owner_user_id", ownerUserId);
  });

  it("creates recurring entries as owner-scoped outflows", async () => {
    const row = {
      id: expenseId,
      owner_user_id: ownerUserId,
      direction: "outflow",
      cashflow_kind: "remuneration",
      label: "Rémunération",
      category_id: categoryId,
      amount_cents: 350_000,
      frequency: "monthly",
      day_of_month: 5,
      start_date: "2026-09-05",
      end_date: null,
      certainty: "certain",
      probability_basis_points: 10_000,
      active: true,
      created_at: "2026-09-07T10:00:00Z",
      updated_at: "2026-09-07T10:00:00Z",
    };
    const { client, queries } = clientWith({
      recurring_cashflows: { data: row, error: null },
    });

    await createRecurringExpense(client, ownerUserId, recurringCommand);

    expect(queries.recurring_cashflows.insert).toHaveBeenCalledWith({
      owner_user_id: ownerUserId,
      direction: "outflow",
      cashflow_kind: "remuneration",
      label: "Rémunération",
      category_id: categoryId,
      amount_cents: 350_000,
      frequency: "monthly",
      day_of_month: 5,
      start_date: "2026-09-05",
      end_date: null,
      certainty: "certain",
      probability_basis_points: 10_000,
      active: true,
    });
  });

  it("owner-scopes recurring updates without allowing ownership changes", async () => {
    const row = {
      id: expenseId,
      owner_user_id: ownerUserId,
      direction: "outflow",
      cashflow_kind: "remuneration",
      label: "Rémunération",
      category_id: categoryId,
      amount_cents: 350_000,
      frequency: "monthly",
      day_of_month: 5,
      start_date: "2026-09-05",
      end_date: null,
      certainty: "certain",
      probability_basis_points: 10_000,
      active: true,
      created_at: "2026-09-07T10:00:00Z",
      updated_at: "2026-09-07T10:00:00Z",
    };
    const { client, queries } = clientWith({ recurring_cashflows: { data: row, error: null } });

    await updateRecurringExpense(client, ownerUserId, expenseId, recurringCommand);

    expect(queries.recurring_cashflows.eq).toHaveBeenCalledWith("id", expenseId);
    expect(queries.recurring_cashflows.eq).toHaveBeenCalledWith("owner_user_id", ownerUserId);
    expect(queries.recurring_cashflows.update.mock.calls[0]?.[0]).not.toHaveProperty("owner_user_id");
  });

  it("creates planned entries as owner-scoped outflows", async () => {
    const row = {
      id: expenseId,
      owner_user_id: ownerUserId,
      direction: "outflow",
      cashflow_kind: "reserve",
      label: "Réserve Urssaf",
      amount_cents: 120_000,
      planned_date: "2026-10-15",
      category_id: categoryId,
      certainty: "committed",
      probability_basis_points: 10_000,
      status: "planned",
      created_at: "2026-09-07T10:00:00Z",
      updated_at: "2026-09-07T10:00:00Z",
    };
    const { client, queries } = clientWith({ planned_cashflows: { data: row, error: null } });

    await createPlannedExpense(client, ownerUserId, plannedCommand);

    expect(queries.planned_cashflows.insert).toHaveBeenCalledWith(
      expect.objectContaining({ owner_user_id: ownerUserId, direction: "outflow" }),
    );
  });

  it("reports an owner-scoped deletion that removed no row", async () => {
    const { client } = clientWith({ planned_cashflows: { data: null, error: null } });

    await expect(deletePlannedExpense(client, ownerUserId, expenseId)).rejects.toEqual(
      new RepositoryError("FC_EXPENSE_NOT_FOUND"),
    );
  });

  it("creates user categories as owner-scoped outflow categories", async () => {
    const row = {
      id: categoryId,
      owner_user_id: ownerUserId,
      name: "Logiciels",
      type: "outflow",
      system_category: false,
      created_at: "2026-09-07T10:00:00Z",
    };
    const { client, queries } = clientWith({ cashflow_categories: { data: row, error: null } });

    await createCategory(client, ownerUserId, { name: "Logiciels" });

    expect(queries.cashflow_categories.insert).toHaveBeenCalledWith({
      owner_user_id: ownerUserId,
      name: "Logiciels",
      type: "outflow",
      system_category: false,
    });
  });
});
