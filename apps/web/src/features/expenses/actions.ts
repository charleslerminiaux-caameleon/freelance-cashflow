"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";
import type { ExpenseActionState } from "./expense-form";
import {
  createCategory,
  createPlannedExpense,
  createRecurringExpense,
  deleteCategory,
  deletePlannedExpense,
  deleteRecurringExpense,
  updateCategory,
  updatePlannedExpense,
  updateRecurringExpense,
} from "./repository";
import {
  categoryFormSchema,
  plannedExpenseFormSchema,
  recurringExpenseFormSchema,
} from "./schema";

const expenseModeSchema = z.enum(["recurring", "planned"]);
const idSchema = z.string().uuid();

function commonExpenseInput(formData: FormData) {
  return {
    label: formData.get("label"),
    categoryId: formData.get("categoryId"),
    cashflowKind: formData.get("cashflowKind"),
    amount: formData.get("amount"),
    certainty: formData.get("certainty"),
    probabilityPercent: formData.get("probabilityPercent"),
  };
}

function recurringCommand(formData: FormData) {
  return recurringExpenseFormSchema.parse({
    ...commonExpenseInput(formData),
    frequency: formData.get("frequency"),
    dayOfMonth: formData.get("dayOfMonth"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    active: formData.get("active") === "on",
  });
}

function plannedCommand(formData: FormData) {
  return plannedExpenseFormSchema.parse({
    ...commonExpenseInput(formData),
    plannedDate: formData.get("plannedDate"),
    status: formData.get("status"),
  });
}

function revalidateForecastViews() {
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  revalidatePath("/cashflow");
}

const expenseFailure = {
  message: "Impossible d’enregistrer cette sortie. Vérifiez les informations.",
  success: false,
} as const;

export async function createExpenseAction(
  _state: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const { userId } = await requireOwner();

  try {
    const mode = expenseModeSchema.parse(formData.get("mode"));
    const client = await createClient();
    if (mode === "recurring") {
      await createRecurringExpense(client, userId, recurringCommand(formData));
    } else {
      await createPlannedExpense(client, userId, plannedCommand(formData));
    }
    revalidateForecastViews();
    return {
      message: mode === "recurring" ? "Sortie récurrente créée." : "Sortie ponctuelle créée.",
      success: true,
    };
  } catch {
    return expenseFailure;
  }
}

export async function updateExpenseAction(
  _state: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const { userId } = await requireOwner();

  try {
    const mode = expenseModeSchema.parse(formData.get("mode"));
    const expenseId = idSchema.parse(formData.get("expenseId"));
    const client = await createClient();
    if (mode === "recurring") {
      await updateRecurringExpense(client, userId, expenseId, recurringCommand(formData));
    } else {
      await updatePlannedExpense(client, userId, expenseId, plannedCommand(formData));
    }
    revalidateForecastViews();
    return { message: "Sortie mise à jour.", success: true };
  } catch {
    return expenseFailure;
  }
}

export async function deleteExpenseAction(
  _state: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const { userId } = await requireOwner();

  try {
    const mode = expenseModeSchema.parse(formData.get("mode"));
    const expenseId = idSchema.parse(formData.get("expenseId"));
    const client = await createClient();
    if (mode === "recurring") {
      await deleteRecurringExpense(client, userId, expenseId);
    } else {
      await deletePlannedExpense(client, userId, expenseId);
    }
    revalidateForecastViews();
    return { message: "Sortie supprimée.", success: true };
  } catch {
    return { message: "Impossible de supprimer cette sortie.", success: false };
  }
}

export async function createCategoryAction(
  _state: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const { userId } = await requireOwner();

  try {
    const command = categoryFormSchema.parse({ name: formData.get("name") });
    const client = await createClient();
    await createCategory(client, userId, command);
    revalidatePath("/expenses");
    return { message: "Catégorie ajoutée.", success: true };
  } catch {
    return { message: "Impossible d’ajouter cette catégorie.", success: false };
  }
}

export async function updateCategoryAction(
  _state: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const { userId } = await requireOwner();

  try {
    const categoryId = idSchema.parse(formData.get("categoryId"));
    const command = categoryFormSchema.parse({ name: formData.get("name") });
    const client = await createClient();
    await updateCategory(client, userId, categoryId, command);
    revalidatePath("/expenses");
    return { message: "Catégorie renommée.", success: true };
  } catch {
    return { message: "Impossible de renommer cette catégorie.", success: false };
  }
}

export async function deleteCategoryAction(
  _state: ExpenseActionState,
  formData: FormData,
): Promise<ExpenseActionState> {
  const { userId } = await requireOwner();

  try {
    const categoryId = idSchema.parse(formData.get("categoryId"));
    const client = await createClient();
    await deleteCategory(client, userId, categoryId);
    revalidatePath("/expenses");
    return { message: "Catégorie supprimée.", success: true };
  } catch {
    return { message: "Impossible de supprimer cette catégorie.", success: false };
  }
}
