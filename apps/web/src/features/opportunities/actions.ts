"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";
import { RepositoryError } from "../repository-error";
import type { CommercialActionState } from "./opportunity-form";
import {
  createOpportunity,
  deleteOpportunity,
  executeOpportunityConversion,
  updateOpportunity,
} from "./repository";
import { conversionFormSchema, opportunityFormSchema } from "./schema";

const opportunityIdSchema = z.string().uuid();

function opportunityCommand(formData: FormData) {
  return opportunityFormSchema.parse({
    customerId: formData.get("customerId"),
    name: formData.get("name"),
    status: formData.get("status"),
    estimatedAmountHt: formData.get("estimatedAmountHt"),
    probabilityPercent: formData.get("probabilityPercent"),
    expectedCloseDate: formData.get("expectedCloseDate"),
    expectedStartDate: formData.get("expectedStartDate"),
    expectedEndDate: formData.get("expectedEndDate"),
    notes: formData.get("notes"),
  });
}

export async function createOpportunityAction(
  _state: CommercialActionState,
  formData: FormData,
): Promise<CommercialActionState> {
  const { userId } = await requireOwner();

  try {
    const command = opportunityCommand(formData);
    const client = await createClient();
    await createOpportunity(client, userId, command);
    revalidatePath("/opportunities");
    return { message: "Opportunité créée.", success: true };
  } catch {
    return { message: "Vérifiez les informations de l’opportunité.", success: false };
  }
}

export async function updateOpportunityAction(
  _state: CommercialActionState,
  formData: FormData,
): Promise<CommercialActionState> {
  const { userId } = await requireOwner();

  try {
    const opportunityId = opportunityIdSchema.parse(formData.get("opportunityId"));
    const command = opportunityCommand(formData);
    const client = await createClient();
    await updateOpportunity(client, userId, opportunityId, command);
    revalidatePath("/opportunities");
    return { message: "Opportunité mise à jour.", success: true };
  } catch (error) {
    const message =
      error instanceof RepositoryError &&
      error.code === "FC_CONVERTED_OPPORTUNITY_IMMUTABLE"
        ? "Une opportunité convertie ne peut plus être modifiée."
        : "Impossible de mettre à jour cette opportunité.";
    return { message, success: false };
  }
}

function deletionErrorMessage(error: unknown): string {
  if (
    error instanceof RepositoryError &&
    error.code === "FC_CONVERTED_OPPORTUNITY_IMMUTABLE"
  ) {
    return "Une opportunité convertie ne peut pas être supprimée.";
  }

  return "Impossible de supprimer cette opportunité.";
}

export async function deleteOpportunityAction(
  _state: CommercialActionState,
  formData: FormData,
): Promise<CommercialActionState> {
  const { userId } = await requireOwner();

  try {
    const opportunityId = opportunityIdSchema.parse(formData.get("opportunityId"));
    const client = await createClient();
    await deleteOpportunity(client, userId, opportunityId);
    revalidatePath("/opportunities");
    return { message: "Opportunité supprimée.", success: true };
  } catch (error) {
    return { message: deletionErrorMessage(error), success: false };
  }
}

function conversionErrorMessage(error: unknown): string {
  if (error instanceof RepositoryError) {
    if (error.code === "FC_OPPORTUNITY_ALREADY_CONVERTED") {
      return "Cette opportunité a déjà été convertie.";
    }

    if (error.code === "FC_OPPORTUNITY_NOT_CONVERTIBLE") {
      return "Cette opportunité ne peut pas être convertie.";
    }
  }

  return "La conversion a échoué. Vérifiez les paramètres puis réessayez.";
}

export async function convertOpportunityAction(
  _state: CommercialActionState,
  formData: FormData,
): Promise<CommercialActionState> {
  const { userId } = await requireOwner();

  try {
    const command = conversionFormSchema.parse({
      opportunityId: formData.get("opportunityId"),
      reference: formData.get("reference"),
      signedAt: formData.get("signedAt"),
      vatRatePercent: formData.get("vatRatePercent"),
      paymentTermsDays: formData.get("paymentTermsDays"),
    });
    const client = await createClient();
    await executeOpportunityConversion(client, userId, {
      opportunityId: command.opportunityId,
      reference: command.reference,
      signedAt: command.signedAt,
      vatRateBasisPoints: command.vatRateBasisPoints,
      paymentTermsDays: command.paymentTermsDays,
    });
    revalidatePath("/opportunities");
    revalidatePath("/engagements");
    return { message: "Opportunité convertie en commande.", success: true };
  } catch (error) {
    return { message: conversionErrorMessage(error), success: false };
  }
}
