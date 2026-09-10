import { beforeEach, expect, it, vi } from "vitest";

import { RepositoryError } from "../repository-error";

const { createBillingScheduleItem, createClient, requireOwner, revalidatePath } = vi.hoisted(() => ({
  createBillingScheduleItem: vi.fn(),
  createClient: vi.fn(),
  requireOwner: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/require-owner", () => ({ requireOwner }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("./repository", () => ({ createBillingScheduleItem }));

import { createBillingScheduleItemAction } from "./actions";

const initialState = { message: null, success: false };
const engagementId = "33333333-3333-4333-8333-333333333333";

function billingStepFormData() {
  const formData = new FormData();
  formData.set("engagementId", engagementId);
  formData.set("label", "Acompte");
  formData.set("plannedInvoiceDate", "2026-09-15");
  formData.set("amountHt", "1 000,00");
  formData.set("vatRatePercent", "20");
  formData.set("paymentTermsDays", "30");
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOwner.mockResolvedValue({ userId: "owner-1" });
  createClient.mockResolvedValue({});
  createBillingScheduleItem.mockResolvedValue({});
});

it("confirms that a billing step was added", async () => {
  const result = await createBillingScheduleItemAction(initialState, billingStepFormData());

  expect(result).toEqual({ message: "Étape de facturation ajoutée.", success: true });
});

it("names billing steps in the amount validation error", async () => {
  createBillingScheduleItem.mockRejectedValue(
    new RepositoryError("FC_BILLING_SCHEDULE_EXCEEDS_ENGAGEMENT"),
  );

  const result = await createBillingScheduleItemAction(initialState, billingStepFormData());

  expect(result).toEqual({
    message: "Le total TTC des étapes de facturation dépasserait le montant TTC de la commande.",
    success: false,
  });
});

it("names the billing step in its generic validation guidance", async () => {
  createBillingScheduleItem.mockRejectedValue(new Error("Invalid input"));

  const result = await createBillingScheduleItemAction(initialState, billingStepFormData());

  expect(result).toEqual({
    message: "Vérifiez le montant, la TVA et les dates de l’étape de facturation.",
    success: false,
  });
});
