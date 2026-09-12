import { beforeEach, expect, it, vi } from "vitest";

const {
  createCategory,
  createClient,
  createPlannedExpense,
  createRecurringExpense,
  deleteCategory,
  deletePlannedExpense,
  deleteRecurringExpense,
  requireOwner,
  revalidatePath,
  updateCategory,
  updatePlannedExpense,
  updateRecurringExpense,
} = vi.hoisted(() => ({
  createCategory: vi.fn(),
  createClient: vi.fn(),
  createPlannedExpense: vi.fn(),
  createRecurringExpense: vi.fn(),
  deleteCategory: vi.fn(),
  deletePlannedExpense: vi.fn(),
  deleteRecurringExpense: vi.fn(),
  requireOwner: vi.fn(),
  revalidatePath: vi.fn(),
  updateCategory: vi.fn(),
  updatePlannedExpense: vi.fn(),
  updateRecurringExpense: vi.fn(),
}));

vi.mock("@/lib/auth/require-owner", () => ({ requireOwner }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("./repository", () => ({
  createCategory,
  createPlannedExpense,
  createRecurringExpense,
  deleteCategory,
  deletePlannedExpense,
  deleteRecurringExpense,
  updatePlannedExpense,
  updateCategory,
  updateRecurringExpense,
}));

import {
  createCategoryAction,
  createExpenseAction,
  deleteExpenseAction,
  updateCategoryAction,
  updateExpenseAction,
} from "./actions";
import { RepositoryError } from "../repository-error";

const initialState = { message: null, success: false };
const expenseId = "22222222-2222-4222-8222-222222222222";

function recurringFormData() {
  const formData = new FormData();
  formData.set("mode", "recurring");
  formData.set("label", "Rémunération");
  formData.set("categoryId", "");
  formData.set("cashflowKind", "remuneration");
  formData.set("amount", "3500,00");
  formData.set("frequency", "monthly");
  formData.set("dayOfMonth", "5");
  formData.set("startDate", "2026-09-05");
  formData.set("endDate", "");
  formData.set("certainty", "certain");
  formData.set("probabilityPercent", "100");
  formData.set("active", "on");
  return formData;
}

function plannedFormData() {
  const formData = new FormData();
  formData.set("mode", "planned");
  formData.set("label", "Réserve Urssaf");
  formData.set("categoryId", "");
  formData.set("cashflowKind", "reserve");
  formData.set("amount", "1200,00");
  formData.set("plannedDate", "2026-10-15");
  formData.set("certainty", "committed");
  formData.set("probabilityPercent", "100");
  formData.set("status", "planned");
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOwner.mockResolvedValue({ userId: "owner-1" });
  createClient.mockResolvedValue({});
  for (const mutation of [
    createCategory,
    createPlannedExpense,
    createRecurringExpense,
    deleteCategory,
    deletePlannedExpense,
    deleteRecurringExpense,
    updatePlannedExpense,
    updateCategory,
    updateRecurringExpense,
  ]) mutation.mockResolvedValue({});
});

it("authenticates before reading expense form data", async () => {
  requireOwner.mockRejectedValue(new Error("redirect"));
  const formData = recurringFormData();
  const get = vi.spyOn(formData, "get");

  await expect(createExpenseAction(initialState, formData)).rejects.toThrow("redirect");

  expect(get).not.toHaveBeenCalled();
  expect(createClient).not.toHaveBeenCalled();
});

it("creates a validated recurring outflow and revalidates forecasts", async () => {
  const result = await createExpenseAction(initialState, recurringFormData());

  expect(createRecurringExpense).toHaveBeenCalledWith(
    {},
    "owner-1",
    expect.objectContaining({
      cashflowKind: "remuneration",
      amountCents: 350_000,
      active: true,
    }),
  );
  expect(result).toEqual({ message: "Sortie récurrente créée.", success: true });
  expect(revalidatePath).toHaveBeenCalledWith("/expenses");
  expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  expect(revalidatePath).toHaveBeenCalledWith("/cashflow");
});

it("updates a validated planned outflow", async () => {
  const formData = plannedFormData();
  formData.set("expenseId", expenseId);

  const result = await updateExpenseAction(initialState, formData);

  expect(updatePlannedExpense).toHaveBeenCalledWith(
    {},
    "owner-1",
    expenseId,
    expect.objectContaining({ cashflowKind: "reserve", plannedDate: "2026-10-15" }),
  );
  expect(result).toEqual({ message: "Sortie mise à jour.", success: true });
});

it("deletes only the selected owner-scoped expense kind", async () => {
  const formData = new FormData();
  formData.set("mode", "recurring");
  formData.set("expenseId", expenseId);

  const result = await deleteExpenseAction(initialState, formData);

  expect(deleteRecurringExpense).toHaveBeenCalledWith({}, "owner-1", expenseId);
  expect(deletePlannedExpense).not.toHaveBeenCalled();
  expect(result).toEqual({ message: "Sortie supprimée.", success: true });
});

it("sanitizes unexpected persistence failures", async () => {
  createRecurringExpense.mockRejectedValue(new Error("private postgres detail"));

  const result = await createExpenseAction(initialState, recurringFormData());

  expect(result).toEqual({
    message: "Impossible d’enregistrer cette sortie. Vérifiez les informations.",
    success: false,
  });
  expect(JSON.stringify(result)).not.toContain("private postgres detail");
});

it("creates a validated owner category", async () => {
  createCategory.mockResolvedValueOnce({
    id: expenseId,
    name: "Logiciels",
    owner_user_id: "owner-1",
    type: "outflow",
    system_category: false,
    created_at: "2026-09-12T10:00:00Z",
  });
  const formData = new FormData();
  formData.set("name", "Logiciels");

  const result = await createCategoryAction(initialState, formData);

  expect(createCategory).toHaveBeenCalledWith({}, "owner-1", { name: "Logiciels" });
  expect(result).toEqual({
    message: "Catégorie ajoutée.",
    success: true,
    category: { id: expenseId, name: "Logiciels" },
  });
});

it("authenticates before reading category form data", async () => {
  requireOwner.mockRejectedValue(new Error("redirect"));
  const formData = new FormData();
  formData.set("name", "Logiciels");
  const get = vi.spyOn(formData, "get");

  await expect(createCategoryAction(initialState, formData)).rejects.toThrow("redirect");

  expect(get).not.toHaveBeenCalled();
  expect(createClient).not.toHaveBeenCalled();
  expect(createCategory).not.toHaveBeenCalled();
});

it("validates and renames an owner category", async () => {
  const formData = new FormData();
  formData.set("categoryId", expenseId);
  formData.set("name", "  Outils numériques  ");

  const result = await updateCategoryAction(initialState, formData);

  expect(updateCategory).toHaveBeenCalledWith({}, "owner-1", expenseId, {
    name: "Outils numériques",
  });
  expect(result).toEqual({ message: "Catégorie renommée.", success: true });
  expect(revalidatePath).toHaveBeenCalledWith("/expenses");
});

it("rejects a forged category id before persistence", async () => {
  const formData = new FormData();
  formData.set("categoryId", "not-a-uuid");
  formData.set("name", "Outils numériques");

  const result = await updateCategoryAction(initialState, formData);

  expect(updateCategory).not.toHaveBeenCalled();
  expect(result).toEqual({ message: "Impossible de renommer cette catégorie.", success: false });
});

it("rejects an empty category name before persistence", async () => {
  const formData = new FormData();
  formData.set("categoryId", expenseId);
  formData.set("name", "   ");

  const result = await updateCategoryAction(initialState, formData);

  expect(updateCategory).not.toHaveBeenCalled();
  expect(result).toEqual({ message: "Impossible de renommer cette catégorie.", success: false });
});

it.each([
  new RepositoryError("FC_CATEGORY_NOT_FOUND"),
  new RepositoryError("23503"),
  new Error("private database outage detail"),
])("sanitizes category rename failures", async (failure) => {
  updateCategory.mockRejectedValueOnce(failure);
  const formData = new FormData();
  formData.set("categoryId", expenseId);
  formData.set("name", "Outils numériques");

  const result = await updateCategoryAction(initialState, formData);

  expect(result).toEqual({ message: "Impossible de renommer cette catégorie.", success: false });
  expect(JSON.stringify(result)).not.toContain("private database outage detail");
});
