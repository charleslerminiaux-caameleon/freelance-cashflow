"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { parseOnboardingInput } from "@/lib/auth/onboarding-input";
import { onboardingErrorMessage } from "@/lib/auth/onboarding-result";
import { getOwnerUserId } from "@/lib/supabase/owner-settings";
import { createClient } from "@/lib/supabase/server";

type OnboardingActionState = { message: string | null };

function readOptionalString(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function onboardOwner(
  _state: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  let command;

  try {
    command = parseOnboardingInput({
      currency: formData.get("currency"),
      timezone: formData.get("timezone"),
      country: formData.get("country"),
      legalForm: readOptionalString(formData.get("legalForm")),
      openingBalance: formData.get("openingBalance"),
      safetyThreshold: formData.get("safetyThreshold"),
    });
  } catch {
    return { message: "Vérifiez les paramètres et les montants saisis." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = z.string().uuid().safeParse(user?.id);

  if (!userId.success) {
    redirect("/login");
  }

  const existingOwnerUserId = await getOwnerUserId();

  if (existingOwnerUserId) {
    if (existingOwnerUserId === userId.data) {
      redirect("/dashboard");
    }

    return { message: "Cette instance possède déjà un propriétaire." };
  }

  const { error } = await supabase.rpc("onboard_owner", {
    p_country: command.country,
    p_currency: command.currency,
    p_legal_form: command.legalForm,
    p_opening_balance_cents: command.openingBalanceCents,
    p_safety_threshold_cents: command.safetyThresholdCents,
    p_timezone: command.timezone,
  });

  if (error) {
    return { message: onboardingErrorMessage(error) };
  }

  redirect("/dashboard");
}
