import { beforeEach, expect, it, vi } from "vitest";

const { createClient, requireOwner, revalidatePath, updateOwnerSettings } = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireOwner: vi.fn(),
  revalidatePath: vi.fn(),
  updateOwnerSettings: vi.fn(),
}));

vi.mock("@/lib/auth/require-owner", () => ({ requireOwner }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("./repository", () => ({ updateOwnerSettings }));

import { updateSettingsAction } from "./actions";

const initialState = { message: null, success: false };

function settingsFormData() {
  const formData = new FormData();
  formData.set("safetyThreshold", "20000,00");
  formData.set("timezone", "Europe/Paris");
  formData.set("legalForm", "SASU");
  formData.set("defaultForecastHorizonDays", "90");
  formData.set("defaultScenario", "committed");
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOwner.mockResolvedValue({ userId: "owner-1" });
  createClient.mockResolvedValue({});
  updateOwnerSettings.mockResolvedValue({});
});

it("authenticates before reading settings form data", async () => {
  requireOwner.mockRejectedValue(new Error("redirect"));
  const formData = settingsFormData();
  const get = vi.spyOn(formData, "get");

  await expect(updateSettingsAction(initialState, formData)).rejects.toThrow("redirect");

  expect(get).not.toHaveBeenCalled();
  expect(createClient).not.toHaveBeenCalled();
});

it("validates and updates the owner singleton", async () => {
  const result = await updateSettingsAction(initialState, settingsFormData());

  expect(updateOwnerSettings).toHaveBeenCalledWith({}, "owner-1", {
    safetyCashThresholdCents: 2_000_000,
    timezone: "Europe/Paris",
    legalForm: "SASU",
    defaultForecastHorizonDays: 90,
    defaultScenario: "committed",
  });
  expect(result).toEqual({ message: "Paramètres enregistrés.", success: true });
  expect(revalidatePath).toHaveBeenCalledWith("/settings");
  expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  expect(revalidatePath).toHaveBeenCalledWith("/cashflow");
});

it("returns a safe validation message for an invalid timezone", async () => {
  const formData = settingsFormData();
  formData.set("timezone", "Paris");

  const result = await updateSettingsAction(initialState, formData);

  expect(result).toEqual({
    message: "Vérifiez le seuil, le fuseau horaire, la forme juridique et les préférences de prévision.",
    success: false,
  });
  expect(updateOwnerSettings).not.toHaveBeenCalled();
});

it.each(["1", "366"])("rejects a forged %s-day horizon before persistence", async (horizon) => {
  const formData = settingsFormData();
  formData.set("defaultForecastHorizonDays", horizon);

  const result = await updateSettingsAction(initialState, formData);

  expect(createClient).not.toHaveBeenCalled();
  expect(updateOwnerSettings).not.toHaveBeenCalled();
  expect(result.success).toBe(false);
});
