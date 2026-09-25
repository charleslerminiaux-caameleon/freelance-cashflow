import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyzeRecurringForOwner: vi.fn(),
  confirmSuggestion: vi.fn(),
  createClient: vi.fn(),
  requireOwner: vi.fn(),
  revalidatePath: vi.fn(),
  setSuggestionState: vi.fn(),
}));

vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("./repository", () => ({
  confirmSuggestion: mocks.confirmSuggestion,
  setSuggestionState: mocks.setSuggestionState,
}));
vi.mock("./service", () => ({ analyzeRecurringForOwner: mocks.analyzeRecurringForOwner }));

import {
  analyzeRecurringAction,
  confirmSuggestionAction,
  dismissSuggestionAction,
  reexamineSuggestionAction,
} from "./actions";

const ownerId = "11111111-1111-4111-8111-111111111111";
const suggestionId = "22222222-2222-4222-8222-222222222222";
const existingExpenseId = "33333333-3333-4333-8333-333333333333";
const categoryId = "44444444-4444-4444-8444-444444444444";
const initialState = { success: false, message: null };

function confirmationForm() {
  const data = new FormData();
  data.set("suggestionId", suggestionId);
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
  mocks.confirmSuggestion.mockResolvedValue("55555555-5555-4555-8555-555555555555");
  mocks.setSuggestionState.mockResolvedValue(undefined);
  mocks.analyzeRecurringForOwner.mockResolvedValue({ success: true, count: 2 });
});

it("authenticates before reading confirmation fields", async () => {
  mocks.requireOwner.mockRejectedValue(new Error("redirect"));
  const formData = confirmationForm();
  const get = vi.spyOn(formData, "get");

  await expect(confirmSuggestionAction(initialState, formData)).rejects.toThrow("redirect");

  expect(get).not.toHaveBeenCalled();
  expect(mocks.createClient).not.toHaveBeenCalled();
});

it("confirms corrected fields with expense defaults and refreshes every affected view", async () => {
  const formData = confirmationForm();
  formData.set("owner_user_id", "99999999-9999-4999-8999-999999999999");
  const result = await confirmSuggestionAction(initialState, formData);

  expect(mocks.confirmSuggestion).toHaveBeenCalledWith(
    { kind: "authenticated-client" },
    ownerId,
    {
      suggestionId,
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
    },
  );
  expect(result).toEqual({ success: true, message: "Récurrence confirmée." });
  for (const path of ["/expenses", "/dashboard", "/cashflow", "/integrations"]) {
    expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
  }
});

it("associates an existing monthly expense without allowing duplicate creation", async () => {
  const data = confirmationForm();
  data.set("existingExpenseId", existingExpenseId);
  data.set("allowDuplicate", "on");

  const result = await confirmSuggestionAction(initialState, data);

  expect(mocks.confirmSuggestion).toHaveBeenCalledWith(
    expect.anything(),
    ownerId,
    expect.objectContaining({ existingExpenseId, allowDuplicate: false }),
  );
  expect(result).toEqual({ success: true, message: "Récurrence associée à la charge existante." });
});

it("sends an explicit duplicate override only for a new charge", async () => {
  const data = confirmationForm();
  data.set("categoryId", "");
  data.set("allowDuplicate", "on");

  await confirmSuggestionAction(initialState, data);

  expect(mocks.confirmSuggestion).toHaveBeenCalledWith(
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
  ["DETECTION_STALE", /plus à jour.*analyse/i],
  ["DETECTION_DUPLICATE", /charge mensuelle similaire/i],
  ["private SQL payload", /impossible de confirmer/i],
])("normalizes confirmation failure %s", async (failure, expected) => {
  mocks.confirmSuggestion.mockRejectedValue(new Error(failure));

  const result = await confirmSuggestionAction(initialState, confirmationForm());

  expect(result.success).toBe(false);
  expect(result.message).toMatch(expected);
  expect(JSON.stringify(result)).not.toContain("private SQL payload");
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it("returns a correction message for invalid confirmation fields", async () => {
  const data = confirmationForm();
  data.set("amount", "montant invalide");

  const result = await confirmSuggestionAction(initialState, data);

  expect(result).toEqual({
    success: false,
    message: "Impossible de confirmer cette récurrence. Vérifiez les informations saisies.",
  });
  expect(mocks.confirmSuggestion).not.toHaveBeenCalled();
});

it("dismisses and reexamines only the selected suggestion", async () => {
  const data = new FormData();
  data.set("suggestionId", suggestionId);

  await expect(dismissSuggestionAction(initialState, data)).resolves.toEqual({
    success: true,
    message: "Suggestion ignorée.",
  });
  expect(mocks.setSuggestionState).toHaveBeenNthCalledWith(
    1,
    { kind: "authenticated-client" },
    ownerId,
    suggestionId,
    "dismiss",
  );

  await expect(reexamineSuggestionAction(initialState, data)).resolves.toEqual({
    success: true,
    message: "Suggestion à réexaminer lors de la prochaine analyse.",
  });
  expect(mocks.setSuggestionState).toHaveBeenNthCalledWith(
    2,
    { kind: "authenticated-client" },
    ownerId,
    suggestionId,
    "reexamine",
  );
});

it("reports manual analysis outcomes with stable messages", async () => {
  await expect(analyzeRecurringAction(initialState, new FormData())).resolves.toEqual({
    success: true,
    message: "Analyse terminée : 6 récurrences détectées.",
  });

  mocks.analyzeRecurringForOwner.mockResolvedValue({ success: false, code: "DETECTION_LOCKED" });
  const failure = await analyzeRecurringAction(initialState, new FormData());
  expect(failure).toEqual({
    success: false,
    message: "Une analyse est déjà en cours. Patientez puis réessayez.",
  });
});

it("authenticates manual analysis before invoking the privileged service", async () => {
  mocks.requireOwner.mockRejectedValue(new Error("redirect"));

  await expect(analyzeRecurringAction(initialState, new FormData())).rejects.toThrow("redirect");

  expect(mocks.analyzeRecurringForOwner).not.toHaveBeenCalled();
});

it("analyzes every bank and tolerates banks without published transactions", async () => {
  mocks.analyzeRecurringForOwner.mockImplementation(async (_owner, provider) => provider === "revolut" ? { success: true, count: 3 } : { success: false, code: "DETECTION_SOURCE_UNAVAILABLE" });
  const result = await analyzeRecurringAction(initialState, new FormData());
  expect(result).toEqual({success: true, message: "Analyse terminée : 3 récurrences détectées."});
  expect(mocks.analyzeRecurringForOwner.mock.calls.map(call => call[1])).toEqual(["qonto", "revolut", "bunq"]);
});
