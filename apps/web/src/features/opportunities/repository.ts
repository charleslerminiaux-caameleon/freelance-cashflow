import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { businessDateSchema } from "../commercial-schema";
import { repositoryError, RepositoryError } from "../repository-error";
import type { OpportunityCommand } from "./schema";

const opportunityCustomerSchema = z.object({
  name: z.string(),
  payment_terms_days: z.number().int(),
});

const opportunityRowSchema = z.object({
  id: z.string().uuid(),
  owner_user_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  name: z.string(),
  status: z.enum(["lead", "qualified", "proposal", "won", "lost"]),
  estimated_amount_ht_cents: z.number().int().safe(),
  probability_basis_points: z.number().int(),
  expected_close_date: businessDateSchema.nullable(),
  expected_start_date: businessDateSchema.nullable(),
  expected_end_date: businessDateSchema.nullable(),
  notes: z.string().nullable(),
  converted_engagement_id: z.string().uuid().nullable(),
  customer: opportunityCustomerSchema,
});

export type Opportunity = z.infer<typeof opportunityRowSchema>;

const opportunityColumns = `
  id,
  owner_user_id,
  customer_id,
  name,
  status,
  estimated_amount_ht_cents,
  probability_basis_points,
  expected_close_date,
  expected_start_date,
  expected_end_date,
  notes,
  converted_engagement_id,
  customer:customers!opportunities_owner_customer_fk(name, payment_terms_days)
`;

export async function listOpportunities(
  client: SupabaseClient,
  ownerUserId: string,
): Promise<Opportunity[]> {
  const { data, error } = await client
    .from("opportunities")
    .select(opportunityColumns)
    .eq("owner_user_id", ownerUserId)
    .order("expected_close_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw repositoryError(error);
  }

  return z.array(opportunityRowSchema).parse(data);
}

export async function getOpportunity(
  client: SupabaseClient,
  ownerUserId: string,
  opportunityId: string,
): Promise<Opportunity> {
  const { data, error } = await client
    .from("opportunities")
    .select(opportunityColumns)
    .eq("id", opportunityId)
    .eq("owner_user_id", ownerUserId)
    .single();

  if (error) {
    throw repositoryError(error);
  }

  return opportunityRowSchema.parse(data);
}

export async function createOpportunity(
  client: SupabaseClient,
  ownerUserId: string,
  command: OpportunityCommand,
): Promise<Opportunity> {
  const { data, error } = await client
    .from("opportunities")
    .insert({
      owner_user_id: ownerUserId,
      customer_id: command.customerId,
      name: command.name,
      status: command.status,
      estimated_amount_ht_cents: command.estimatedAmountHtCents,
      probability_basis_points: command.probabilityBasisPoints,
      expected_close_date: command.expectedCloseDate,
      expected_start_date: command.expectedStartDate,
      expected_end_date: command.expectedEndDate,
      notes: command.notes,
    })
    .select(opportunityColumns)
    .single();

  if (error) {
    throw repositoryError(error);
  }

  return opportunityRowSchema.parse(data);
}

export async function updateOpportunity(
  client: SupabaseClient,
  ownerUserId: string,
  opportunityId: string,
  command: OpportunityCommand,
): Promise<Opportunity> {
  const { data, error } = await client
    .from("opportunities")
    .update({
      customer_id: command.customerId,
      name: command.name,
      status: command.status,
      estimated_amount_ht_cents: command.estimatedAmountHtCents,
      probability_basis_points: command.probabilityBasisPoints,
      expected_close_date: command.expectedCloseDate,
      expected_start_date: command.expectedStartDate,
      expected_end_date: command.expectedEndDate,
      notes: command.notes,
    })
    .eq("id", opportunityId)
    .eq("owner_user_id", ownerUserId)
    .select(opportunityColumns)
    .single();

  if (error) {
    throw repositoryError(error);
  }

  return opportunityRowSchema.parse(data);
}

export async function deleteOpportunity(
  client: SupabaseClient,
  ownerUserId: string,
  opportunityId: string,
): Promise<void> {
  const { error } = await client
    .from("opportunities")
    .delete()
    .eq("id", opportunityId)
    .eq("owner_user_id", ownerUserId);

  if (error) {
    throw repositoryError(error);
  }
}

export async function executeOpportunityConversion(
  client: SupabaseClient,
  ownerUserId: string,
  command: {
    opportunityId: string;
    reference: string;
    signedAt: string;
    amountTtcCents: number;
    paymentTermsDays: number;
  },
): Promise<string> {
  const { data: ownedOpportunity, error: ownershipError } = await client
    .from("opportunities")
    .select("id")
    .eq("id", command.opportunityId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  if (ownershipError) {
    throw repositoryError(ownershipError);
  }

  if (!ownedOpportunity) {
    throw new RepositoryError("FC_OPPORTUNITY_NOT_CONVERTIBLE");
  }

  const { data, error } = await client.rpc("convert_opportunity", {
    p_opportunity_id: command.opportunityId,
    p_reference: command.reference,
    p_signed_at: command.signedAt,
    p_amount_ttc_cents: command.amountTtcCents,
    p_payment_terms_days: command.paymentTermsDays,
  });

  if (error) {
    throw repositoryError(error);
  }

  return z.string().uuid().parse(data);
}
