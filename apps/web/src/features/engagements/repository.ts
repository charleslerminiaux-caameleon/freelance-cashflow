import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { businessDateSchema } from "../commercial-schema";
import { repositoryError, RepositoryError } from "../repository-error";
import type { BillingScheduleCommand } from "./schema";

const engagementCustomerSchema = z.object({ name: z.string() });

const engagementRowSchema = z.object({
  id: z.string().uuid(),
  owner_user_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  opportunity_id: z.string().uuid().nullable(),
  reference: z.string(),
  signed_at: businessDateSchema,
  start_date: businessDateSchema.nullable(),
  end_date: businessDateSchema.nullable(),
  amount_ht_cents: z.number().int().safe(),
  amount_ttc_cents: z.number().int().safe(),
  status: z.enum(["draft", "active", "completed", "cancelled"]),
  payment_terms_days: z.number().int(),
  customer: engagementCustomerSchema,
});

const billingScheduleRowSchema = z.object({
  id: z.string().uuid(),
  owner_user_id: z.string().uuid(),
  engagement_id: z.string().uuid(),
  label: z.string(),
  planned_invoice_date: businessDateSchema,
  amount_ht_cents: z.number().int().safe(),
  vat_cents: z.number().int().safe(),
  amount_ttc_cents: z.number().int().safe(),
  payment_terms_days: z.number().int(),
  expected_payment_date: businessDateSchema,
  status: z.enum(["planned", "invoiced", "cancelled"]),
});

export type Engagement = z.infer<typeof engagementRowSchema>;
export type BillingScheduleItem = z.infer<typeof billingScheduleRowSchema>;

const engagementColumns = `
  id,
  owner_user_id,
  customer_id,
  opportunity_id,
  reference,
  signed_at,
  start_date,
  end_date,
  amount_ht_cents,
  amount_ttc_cents,
  status,
  payment_terms_days,
  customer:customers!engagements_owner_customer_fk(name)
`;

const billingScheduleColumns = `
  id,
  owner_user_id,
  engagement_id,
  label,
  planned_invoice_date,
  amount_ht_cents,
  vat_cents,
  amount_ttc_cents,
  payment_terms_days,
  expected_payment_date,
  status
`;

export async function listEngagements(
  client: SupabaseClient,
  ownerUserId: string,
): Promise<Engagement[]> {
  const { data, error } = await client
    .from("engagements")
    .select(engagementColumns)
    .eq("owner_user_id", ownerUserId)
    .order("signed_at", { ascending: false });

  if (error) {
    throw repositoryError(error);
  }

  return z.array(engagementRowSchema).parse(data);
}

export async function getEngagement(
  client: SupabaseClient,
  ownerUserId: string,
  engagementId: string,
): Promise<Engagement | null> {
  const { data, error } = await client
    .from("engagements")
    .select(engagementColumns)
    .eq("id", engagementId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  if (error) {
    throw repositoryError(error);
  }

  return data === null ? null : engagementRowSchema.parse(data);
}

export async function listBillingScheduleItems(
  client: SupabaseClient,
  ownerUserId: string,
  engagementId: string,
): Promise<BillingScheduleItem[]> {
  const { data, error } = await client
    .from("billing_schedule_items")
    .select(billingScheduleColumns)
    .eq("engagement_id", engagementId)
    .eq("owner_user_id", ownerUserId)
    .order("planned_invoice_date");

  if (error) {
    throw repositoryError(error);
  }

  return z.array(billingScheduleRowSchema).parse(data);
}

export async function createBillingScheduleItem(
  client: SupabaseClient,
  ownerUserId: string,
  command: BillingScheduleCommand,
): Promise<BillingScheduleItem> {
  const engagement = await getEngagement(client, ownerUserId, command.engagementId);

  if (!engagement) {
    throw new RepositoryError("FC_ENGAGEMENT_NOT_FOUND");
  }

  const { data, error } = await client
    .from("billing_schedule_items")
    .insert({
      owner_user_id: ownerUserId,
      engagement_id: command.engagementId,
      label: command.label,
      planned_invoice_date: command.plannedInvoiceDate,
      amount_ht_cents: command.amountHtCents,
      vat_cents: command.vatCents,
      amount_ttc_cents: command.amountTtcCents,
      payment_terms_days: command.paymentTermsDays,
      expected_payment_date: command.expectedPaymentDate,
      status: "planned",
    })
    .select(billingScheduleColumns)
    .single();

  if (error) {
    throw repositoryError(error);
  }

  return billingScheduleRowSchema.parse(data);
}
