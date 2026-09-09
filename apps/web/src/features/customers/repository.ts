import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { repositoryError, RepositoryError } from "../repository-error";
import type { CustomerCommand } from "./schema";

const customerRowSchema = z.object({
  id: z.string().uuid(),
  owner_user_id: z.string().uuid(),
  name: z.string(),
  email: z.string().nullable(),
  payment_terms_days: z.number().int(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Customer = z.infer<typeof customerRowSchema>;

const customerColumns =
  "id, owner_user_id, name, email, payment_terms_days, notes, created_at, updated_at";

export async function listCustomers(
  client: SupabaseClient,
  ownerUserId: string,
): Promise<Customer[]> {
  const { data, error } = await client
    .from("customers")
    .select(customerColumns)
    .eq("owner_user_id", ownerUserId)
    .order("name");

  if (error) {
    throw repositoryError(error);
  }

  return z.array(customerRowSchema).parse(data);
}

export async function createCustomer(
  client: SupabaseClient,
  ownerUserId: string,
  command: CustomerCommand,
): Promise<Customer> {
  const { data, error } = await client
    .from("customers")
    .insert({
      owner_user_id: ownerUserId,
      name: command.name,
      email: command.email,
      payment_terms_days: command.paymentTermsDays,
      notes: command.notes,
    })
    .select(customerColumns)
    .single();

  if (error) {
    throw repositoryError(error);
  }

  return customerRowSchema.parse(data);
}

export async function updateCustomer(
  client: SupabaseClient,
  ownerUserId: string,
  customerId: string,
  command: CustomerCommand,
): Promise<Customer> {
  const { data, error } = await client
    .from("customers")
    .update({
      name: command.name,
      email: command.email,
      payment_terms_days: command.paymentTermsDays,
      notes: command.notes,
    })
    .eq("id", customerId)
    .eq("owner_user_id", ownerUserId)
    .select(customerColumns)
    .single();

  if (error) {
    throw repositoryError(error);
  }

  return customerRowSchema.parse(data);
}

export async function deleteCustomer(
  client: SupabaseClient,
  ownerUserId: string,
  customerId: string,
): Promise<void> {
  const { data, error } = await client
    .from("customers")
    .delete()
    .eq("id", customerId)
    .eq("owner_user_id", ownerUserId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw repositoryError(error);
  }

  if (!data) {
    throw new RepositoryError("FC_CUSTOMER_NOT_FOUND");
  }
}
