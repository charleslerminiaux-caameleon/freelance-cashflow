"use server";

import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";
import type { CommercialActionState } from "../opportunities/opportunity-form";
import { RepositoryError } from "../repository-error";
import { createBillingScheduleItem } from "./repository";
import { billingScheduleFormSchema } from "./schema";

function scheduleErrorMessage(error: unknown): string {
  if (
    error instanceof RepositoryError &&
    error.code === "FC_BILLING_SCHEDULE_EXCEEDS_ENGAGEMENT"
  ) {
    return "Le total TTC des étapes de facturation dépasserait le montant TTC de la commande.";
  }

  if (error instanceof RepositoryError && error.code === "FC_ENGAGEMENT_NOT_FOUND") {
    return "Cette commande est introuvable.";
  }

  return "Vérifiez le montant, la TVA et les dates de l’étape de facturation.";
}

export async function createBillingScheduleItemAction(
  _state: CommercialActionState,
  formData: FormData,
): Promise<CommercialActionState> {
  const { userId } = await requireOwner();

  try {
    const command = billingScheduleFormSchema.parse({
      engagementId: formData.get("engagementId"),
      label: formData.get("label"),
      plannedInvoiceDate: formData.get("plannedInvoiceDate"),
      amountHt: formData.get("amountHt"),
      vatRatePercent: formData.get("vatRatePercent"),
      paymentTermsDays: formData.get("paymentTermsDays"),
    });
    const client = await createClient();
    await createBillingScheduleItem(client, userId, command);
    revalidatePath(`/engagements/${command.engagementId}`);
    revalidatePath("/engagements");
    return { message: "Étape de facturation ajoutée.", success: true };
  } catch (error) {
    return { message: scheduleErrorMessage(error), success: false };
  }
}
