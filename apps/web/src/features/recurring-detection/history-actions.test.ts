import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirmRecurringFromTransaction: vi.fn(),
  createClient: vi.fn(),
  requireOwner: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("./history-repository", () => ({
  confirmRecurringFromTransaction: mocks.confirmRecurringFromTransaction,
}));

import { createHistoryRecurringAction } from "./history-actions";

const ownerId = "11111111-1111-4111-8111-111111111111";
const transactionId = "22222222-2222-4222-8222-222222222222";
const expenseId = "33333333-3333-4333-8333-333333333333";
const categoryId = "44444444-4444-4444-8444-444444444444";
const initialState = { success: false, message: null };

function validForm(): FormData {
  const data = new FormData();
  data.set("transactionId", transactionId);
  data.set("sourcePublication", "2026-09-11T10:00:00.123456Z");
  data.set("label", "  Cloud corrigé  ");
  data.set("amount", "123,45");
  data.set("dayOfMonth", "9");
  data.set("startDate", "2026-10-09");
  data.set("categoryId", categoryId);
  data.set("certainty", "probable");
  data.set("probabilityPercent", "65,5");
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOwner.mockResolvedValue({ userId: ownerId });
  mocks.createClient.mockResolvedValue({ kind: "authenticated-client" });
  mocks.confirmRecurringFromTransaction.mockResolvedValue(expenseId);
});

it("authenticates before reading any browser field", async () => {
  mocks.requireOwner.mockRejectedValue(new Error("redirect"));
  const formData = validForm();
  const get = vi.spyOn(formData, "get");

  await expect(createHistoryRecurringAction(initialState, formData)).rejects.toThrow("redirect");

  expect(get).not.toHaveBeenCalled();
  expect(mocks.createClient).not.toHaveBeenCalled();
});

it("confirms the owner transaction with parsed command fields and refreshes affected views", async () => {
  const formData = validForm();
  formData.set("owner_user_id", "99999999-9999-4999-8999-999999999999");
  formData.set("accountId", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  formData.set("amountCents", "99999999");
  formData.set("currency", "USD");
  formData.set("rawPayload", "private payload");

  const result = await createHistoryRecurringAction(initialState, formData);

  expect(mocks.confirmRecurringFromTransaction).toHaveBeenCalledWith(
    { kind: "authenticated-client" },
    ownerId,
    {
      transactionId,
      sourcePublication: "2026-09-11T10:00:00.123456Z",
      command: {
        label: "Cloud corrigé",
        amount_cents: 12_345,
        day_of_month: 9,
        start_date: "2026-10-09",
        category_id: categoryId,
        cashflow_kind: "expense",
        certainty: "probable",
        probability_basis_points: 6_550,
      },
      existingExpenseId: null,
      allowDuplicate: false,
      allowRecreate: false,
    },
  );
  expect(result).toEqual({
    success: true,
    message: "Charge récurrente créée depuis l’historique.",
    expenseId,
  });
  for (const path of ["/expenses", "/cashflow", "/dashboard"]) {
    expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
  }
  expect(JSON.stringify(mocks.confirmRecurringFromTransaction.mock.calls)).not.toContain(
    "private payload",
  );
});

it("associates an existing charge and forwards explicit recreate consent", async () => {
  const formData = validForm();
  formData.set("existingExpenseId", expenseId);
  formData.set("allowDuplicate", "on");
  formData.set("allowRecreate", "on");

  const result = await createHistoryRecurringAction(initialState, formData);

  expect(mocks.confirmRecurringFromTransaction).toHaveBeenCalledWith(
    expect.anything(),
    ownerId,
    expect.objectContaining({
      existingExpenseId: expenseId,
      allowDuplicate: false,
      allowRecreate: true,
    }),
  );
  expect(result).toEqual({
    success: true,
    message: "Opération associée à la charge existante.",
    expenseId,
  });
});

it("forwards duplicate consent only when creating a new charge", async () => {
  const formData = validForm();
  formData.set("categoryId", "");
  formData.set("allowDuplicate", "on");

  await createHistoryRecurringAction(initialState, formData);

  expect(mocks.confirmRecurringFromTransaction).toHaveBeenCalledWith(
    expect.anything(),
    ownerId,
    expect.objectContaining({
      existingExpenseId: null,
      allowDuplicate: true,
      command: expect.objectContaining({ category_id: null }),
    }),
  );
});

it.each([
  ["DETECTION_STALE", /opération bancaire n’est plus à jour/i],
  ["DETECTION_NOT_FOUND", /opération bancaire n’est plus à jour/i],
  ["DETECTION_SOURCE_UNAVAILABLE", /synchronisez Qonto/i],
  ["DETECTION_DUPLICATE", /charge mensuelle similaire/i],
  ["private SQL payload", /impossible de créer cette charge récurrente/i],
])("returns a safe recoverable failure for %s", async (failure, expected) => {
  mocks.confirmRecurringFromTransaction.mockRejectedValue(new Error(failure));

  const result = await createHistoryRecurringAction(initialState, validForm());

  expect(result.success).toBe(false);
  expect(result.message).toMatch(expected);
  expect(JSON.stringify(result)).not.toContain("private SQL payload");
  expect(result).not.toHaveProperty("expenseId");
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it("rejects invalid edited values before the repository call", async () => {
  const formData = validForm();
  formData.set("amount", "montant invalide");

  await expect(createHistoryRecurringAction(initialState, formData)).resolves.toEqual({
    success: false,
    message: "Impossible de créer cette charge récurrente. Vérifiez les informations saisies.",
  });
  expect(mocks.confirmRecurringFromTransaction).not.toHaveBeenCalled();
});
