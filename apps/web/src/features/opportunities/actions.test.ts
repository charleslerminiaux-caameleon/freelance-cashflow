import { beforeEach, expect, it, vi } from "vitest";

import { RepositoryError } from "../repository-error";

const { createClient, deleteOpportunity, requireOwner, revalidatePath, updateOpportunity } =
  vi.hoisted(() => ({
    createClient: vi.fn(),
    deleteOpportunity: vi.fn(),
    requireOwner: vi.fn(),
    revalidatePath: vi.fn(),
    updateOpportunity: vi.fn(),
  }));

vi.mock("@/lib/auth/require-owner", () => ({ requireOwner }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("./repository", () => ({
  createOpportunity: vi.fn(),
  deleteOpportunity,
  executeOpportunityConversion: vi.fn(),
  getOpportunity: vi.fn(),
  updateOpportunity,
}));

import { deleteOpportunityAction, updateOpportunityAction } from "./actions";

const initialState = { message: null, success: false };
const opportunityId = "22222222-2222-4222-8222-222222222222";

function deletionFormData(id = opportunityId) {
  const formData = new FormData();
  formData.set("opportunityId", id);
  return formData;
}

function updateFormData() {
  const formData = new FormData();
  formData.set("opportunityId", opportunityId);
  formData.set("customerId", "33333333-3333-4333-8333-333333333333");
  formData.set("name", "Audit SI");
  formData.set("status", "proposal");
  formData.set("estimatedAmountHt", "6000,00");
  formData.set("probabilityPercent", "75");
  formData.set("expectedCloseDate", "");
  formData.set("expectedStartDate", "");
  formData.set("expectedEndDate", "");
  formData.set("notes", "");
  return formData;
}

beforeEach(() => {
  requireOwner.mockReset();
  createClient.mockReset();
  deleteOpportunity.mockReset();
  updateOpportunity.mockReset();
  revalidatePath.mockReset();
  requireOwner.mockResolvedValue({ userId: "owner-1" });
  createClient.mockResolvedValue({});
  deleteOpportunity.mockResolvedValue(undefined);
  updateOpportunity.mockResolvedValue(undefined);
});

it("returns a success state after deleting an opportunity", async () => {
  const result = await deleteOpportunityAction(initialState, deletionFormData());

  expect(result).toEqual({ message: "Opportunité supprimée.", success: true });
  expect(revalidatePath).toHaveBeenCalledWith("/opportunities");
});

it("returns a safe refusal when the opportunity was converted", async () => {
  deleteOpportunity.mockRejectedValue(
    new RepositoryError("FC_CONVERTED_OPPORTUNITY_IMMUTABLE"),
  );

  const result = await deleteOpportunityAction(initialState, deletionFormData());

  expect(result).toEqual({
    message: "Une opportunité convertie ne peut pas être supprimée.",
    success: false,
  });
});

it("returns a safe message for a malformed opportunity identifier", async () => {
  const malformed = await deleteOpportunityAction(initialState, deletionFormData("not-a-uuid"));

  expect(malformed).toEqual({
    message: "Impossible de supprimer cette opportunité.",
    success: false,
  });
});

it("does not expose unexpected database failure details", async () => {
  deleteOpportunity.mockRejectedValue(new Error("private postgres connection detail"));
  const outage = await deleteOpportunityAction(initialState, deletionFormData());

  expect(outage).toEqual({
    message: "Impossible de supprimer cette opportunité.",
    success: false,
  });
  expect(JSON.stringify(outage)).not.toContain("private postgres connection detail");
});

it("explains safely that a converted opportunity can no longer be edited", async () => {
  updateOpportunity.mockRejectedValue(
    new RepositoryError("FC_CONVERTED_OPPORTUNITY_IMMUTABLE"),
  );

  const result = await updateOpportunityAction(initialState, updateFormData());

  expect(result).toEqual({
    message: "Une opportunité convertie ne peut plus être modifiée.",
    success: false,
  });
});
