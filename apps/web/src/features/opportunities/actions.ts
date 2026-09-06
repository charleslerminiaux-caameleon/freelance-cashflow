"use server";

import { convertOpportunity as prepareOpportunityConversion } from "@fc/domain";
import { moneyCents } from "@fc/shared";
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
  getOpportunity,
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
  } catch {
    return { message: "Impossible de mettre à jour cette opportunité.", success: false };
  }
}

export async function deleteOpportunityAction(formData: FormData): Promise<void> {
  const { userId } = await requireOwner();

  try {
    const opportunityId = opportunityIdSchema.parse(formData.get("opportunityId"));
    const client = await createClient();
    await deleteOpportunity(client, userId, opportunityId);
    revalidatePath("/opportunities");
  } catch {
    // Converted opportunities remain linked and unchanged when deletion is rejected.
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
    const opportunity = await getOpportunity(client, userId, command.opportunityId);

    if (opportunity.converted_engagement_id !== null || opportunity.status === "won") {
      throw new RepositoryError("FC_OPPORTUNITY_ALREADY_CONVERTED");
    }

    const conversion = prepareOpportunityConversion({
      opportunityId: opportunity.id,
      customerId: opportunity.customer_id,
      name: command.reference,
      status: opportunity.status,
      amountHtCents: moneyCents(opportunity.estimated_amount_ht_cents),
      vatRateBasisPoints: command.vatRateBasisPoints,
      paymentTermsDays: command.paymentTermsDays,
      signedAt: command.signedAt,
    });

    await executeOpportunityConversion(client, userId, {
      opportunityId: opportunity.id,
      reference: conversion.engagement.reference,
      signedAt: conversion.engagement.signedAt,
      amountTtcCents: conversion.engagement.amountTtcCents,
      paymentTermsDays: conversion.engagement.paymentTermsDays,
    });
    revalidatePath("/opportunities");
    revalidatePath("/engagements");
    return { message: "Opportunité convertie en commande.", success: true };
  } catch (error) {
    return { message: conversionErrorMessage(error), success: false };
  }
}
