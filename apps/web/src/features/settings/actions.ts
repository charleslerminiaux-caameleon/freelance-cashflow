"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";
import type { SettingsActionState } from "./settings-form";
import { updateOwnerSettings } from "./repository";
import { settingsFormSchema } from "./schema";

export async function updateSettingsAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const { userId } = await requireOwner();

  try {
    const command = settingsFormSchema.parse({
      safetyThreshold: formData.get("safetyThreshold"),
      timezone: formData.get("timezone"),
      legalForm: formData.get("legalForm"),
      defaultForecastHorizonDays: formData.get("defaultForecastHorizonDays"),
      defaultScenario: formData.get("defaultScenario"),
    });
    const client = await createClient();
    await updateOwnerSettings(client, userId, command);
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/cashflow");
    return { message: "Paramètres enregistrés.", success: true };
  } catch {
    return {
      message:
        "Vérifiez le seuil, le fuseau horaire, la forme juridique et les préférences de prévision.",
      success: false,
    };
  }
}
