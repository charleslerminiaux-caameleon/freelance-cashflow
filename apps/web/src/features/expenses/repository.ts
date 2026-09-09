import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { businessDateSchema } from "../commercial-schema";
import { repositoryError, RepositoryError } from "../repository-error";
import type {
  CategoryCommand,
  PlannedExpenseCommand,
  RecurringExpenseCommand,
} from "./schema";

const categoryRowSchema = z.object({
  id: z.string().uuid(),
  owner_user_id: z.string().uuid(),
  name: z.string(),
  type: z.enum(["inflow", "outflow", "both"]),
  system_category: z.boolean(),
  created_at: z.string(),
});

const recurringExpenseRowSchema = z.object({
  id: z.string().uuid(),
  owner_user_id: z.string().uuid(),
  direction: z.literal("outflow"),
  cashflow_kind: z.enum(["expense", "remuneration", "reserve"]),
  label: z.string(),
  category_id: z.string().uuid().nullable(),
  amount_cents: z.number().int().safe().positive(),
  frequency: z.enum(["monthly", "quarterly", "yearly"]),
  day_of_month: z.number().int().min(1).max(31),
  start_date: businessDateSchema,
  end_date: businessDateSchema.nullable(),
  certainty: z.enum(["certain", "committed", "probable"]),
  probability_basis_points: z.number().int().min(0).max(10_000),
  active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

const plannedExpenseRowSchema = z.object({
  id: z.string().uuid(),
  owner_user_id: z.string().uuid(),
  direction: z.literal("outflow"),
  cashflow_kind: z.enum(["expense", "remuneration", "reserve"]),
  label: z.string(),
  amount_cents: z.number().int().safe().positive(),
  planned_date: businessDateSchema,
  category_id: z.string().uuid().nullable(),
  certainty: z.enum(["certain", "committed", "probable"]),
  probability_basis_points: z.number().int().min(0).max(10_000),
  status: z.enum(["planned", "realized", "cancelled"]),
  created_at: z.string(),
  updated_at: z.string(),
});

export type CashflowCategory = z.infer<typeof categoryRowSchema>;
export type RecurringExpense = z.infer<typeof recurringExpenseRowSchema>;
export type PlannedExpense = z.infer<typeof plannedExpenseRowSchema>;

const categoryColumns = "id, owner_user_id, name, type, system_category, created_at";
const recurringColumns = `
  id, owner_user_id, direction, cashflow_kind, label, category_id, amount_cents,
  frequency, day_of_month, start_date, end_date, certainty,
  probability_basis_points, active, created_at, updated_at
`;
const plannedColumns = `
  id, owner_user_id, direction, cashflow_kind, label, amount_cents, planned_date,
  category_id, certainty, probability_basis_points, status, created_at, updated_at
`;

export type ExpenseWorkspace = {
  categories: CashflowCategory[];
  recurringExpenses: RecurringExpense[];
  plannedExpenses: PlannedExpense[];
};

export async function listExpenseWorkspace(
  client: SupabaseClient,
  ownerUserId: string,
): Promise<ExpenseWorkspace> {
  const [categoriesResult, recurringResult, plannedResult] = await Promise.all([
    client
      .from("cashflow_categories")
      .select(categoryColumns)
      .eq("owner_user_id", ownerUserId)
      .in("type", ["outflow", "both"])
      .order("name"),
    client
      .from("recurring_cashflows")
      .select(recurringColumns)
      .eq("owner_user_id", ownerUserId)
      .eq("direction", "outflow")
      .order("start_date", { ascending: true })
      .order("label", { ascending: true }),
    client
      .from("planned_cashflows")
      .select(plannedColumns)
      .eq("owner_user_id", ownerUserId)
      .eq("direction", "outflow")
      .order("planned_date", { ascending: true })
      .order("label", { ascending: true }),
  ]);

  for (const result of [categoriesResult, recurringResult, plannedResult]) {
    if (result.error) throw repositoryError(result.error);
  }

  return {
    categories: z.array(categoryRowSchema).parse(categoriesResult.data),
    recurringExpenses: z.array(recurringExpenseRowSchema).parse(recurringResult.data),
    plannedExpenses: z.array(plannedExpenseRowSchema).parse(plannedResult.data),
  };
}

export async function createCategory(
  client: SupabaseClient,
  ownerUserId: string,
  command: CategoryCommand,
): Promise<CashflowCategory> {
  const { data, error } = await client
    .from("cashflow_categories")
    .insert({
      owner_user_id: ownerUserId,
      name: command.name,
      type: "outflow",
      system_category: false,
    })
    .select(categoryColumns)
    .single();

  if (error) throw repositoryError(error);
  return categoryRowSchema.parse(data);
}

export async function updateCategory(
  client: SupabaseClient,
  ownerUserId: string,
  categoryId: string,
  command: CategoryCommand,
): Promise<CashflowCategory> {
  const { data, error } = await client
    .from("cashflow_categories")
    .update({ name: command.name })
    .eq("id", categoryId)
    .eq("owner_user_id", ownerUserId)
    .eq("system_category", false)
    .select(categoryColumns)
    .maybeSingle();

  if (error) throw repositoryError(error);
  if (!data) throw new RepositoryError("FC_CATEGORY_NOT_FOUND");
  return categoryRowSchema.parse(data);
}

export async function deleteCategory(
  client: SupabaseClient,
  ownerUserId: string,
  categoryId: string,
): Promise<void> {
  const { data, error } = await client
    .from("cashflow_categories")
    .delete()
    .eq("id", categoryId)
    .eq("owner_user_id", ownerUserId)
    .eq("system_category", false)
    .select("id")
    .maybeSingle();

  if (error) throw repositoryError(error);
  if (!data) throw new RepositoryError("FC_CATEGORY_NOT_FOUND");
}

function recurringPayload(command: RecurringExpenseCommand) {
  return {
    direction: "outflow" as const,
    cashflow_kind: command.cashflowKind,
    label: command.label,
    category_id: command.categoryId,
    amount_cents: command.amountCents,
    frequency: command.frequency,
    day_of_month: command.dayOfMonth,
    start_date: command.startDate,
    end_date: command.endDate,
    certainty: command.certainty,
    probability_basis_points: command.probabilityBasisPoints,
    active: command.active,
  };
}

export async function createRecurringExpense(
  client: SupabaseClient,
  ownerUserId: string,
  command: RecurringExpenseCommand,
): Promise<RecurringExpense> {
  const { data, error } = await client
    .from("recurring_cashflows")
    .insert({ owner_user_id: ownerUserId, ...recurringPayload(command) })
    .select(recurringColumns)
    .single();

  if (error) throw repositoryError(error);
  return recurringExpenseRowSchema.parse(data);
}

export async function updateRecurringExpense(
  client: SupabaseClient,
  ownerUserId: string,
  expenseId: string,
  command: RecurringExpenseCommand,
): Promise<RecurringExpense> {
  const { data, error } = await client
    .from("recurring_cashflows")
    .update(recurringPayload(command))
    .eq("id", expenseId)
    .eq("owner_user_id", ownerUserId)
    .eq("direction", "outflow")
    .select(recurringColumns)
    .maybeSingle();

  if (error) throw repositoryError(error);
  if (!data) throw new RepositoryError("FC_EXPENSE_NOT_FOUND");
  return recurringExpenseRowSchema.parse(data);
}

export async function deleteRecurringExpense(
  client: SupabaseClient,
  ownerUserId: string,
  expenseId: string,
): Promise<void> {
  const { data, error } = await client
    .from("recurring_cashflows")
    .delete()
    .eq("id", expenseId)
    .eq("owner_user_id", ownerUserId)
    .eq("direction", "outflow")
    .select("id")
    .maybeSingle();

  if (error) throw repositoryError(error);
  if (!data) throw new RepositoryError("FC_EXPENSE_NOT_FOUND");
}

function plannedPayload(command: PlannedExpenseCommand) {
  return {
    direction: "outflow" as const,
    cashflow_kind: command.cashflowKind,
    label: command.label,
    amount_cents: command.amountCents,
    planned_date: command.plannedDate,
    category_id: command.categoryId,
    certainty: command.certainty,
    probability_basis_points: command.probabilityBasisPoints,
    status: command.status,
  };
}

export async function createPlannedExpense(
  client: SupabaseClient,
  ownerUserId: string,
  command: PlannedExpenseCommand,
): Promise<PlannedExpense> {
  const { data, error } = await client
    .from("planned_cashflows")
    .insert({ owner_user_id: ownerUserId, ...plannedPayload(command) })
    .select(plannedColumns)
    .single();

  if (error) throw repositoryError(error);
  return plannedExpenseRowSchema.parse(data);
}

export async function updatePlannedExpense(
  client: SupabaseClient,
  ownerUserId: string,
  expenseId: string,
  command: PlannedExpenseCommand,
): Promise<PlannedExpense> {
  const { data, error } = await client
    .from("planned_cashflows")
    .update(plannedPayload(command))
    .eq("id", expenseId)
    .eq("owner_user_id", ownerUserId)
    .eq("direction", "outflow")
    .select(plannedColumns)
    .maybeSingle();

  if (error) throw repositoryError(error);
  if (!data) throw new RepositoryError("FC_EXPENSE_NOT_FOUND");
  return plannedExpenseRowSchema.parse(data);
}

export async function deletePlannedExpense(
  client: SupabaseClient,
  ownerUserId: string,
  expenseId: string,
): Promise<void> {
  const { data, error } = await client
    .from("planned_cashflows")
    .delete()
    .eq("id", expenseId)
    .eq("owner_user_id", ownerUserId)
    .eq("direction", "outflow")
    .select("id")
    .maybeSingle();

  if (error) throw repositoryError(error);
  if (!data) throw new RepositoryError("FC_EXPENSE_NOT_FOUND");
}
