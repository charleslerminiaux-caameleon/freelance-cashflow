"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";
import type { CommercialActionState } from "../opportunities/opportunity-form";
import { RepositoryError } from "../repository-error";
import { createCustomer, deleteCustomer, updateCustomer } from "./repository";
import { customerFormSchema } from "./schema";

const customerIdSchema = z.string().uuid();

function customerCommand(formData: FormData) {
  return customerFormSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    paymentTermsDays: formData.get("paymentTermsDays"),
    notes: formData.get("notes"),
  });
}

export async function createCustomerAction(
  _state: CommercialActionState,
  formData: FormData,
): Promise<CommercialActionState> {
  const { userId } = await requireOwner();

  try {
    const command = customerCommand(formData);
    const client = await createClient();
    await createCustomer(client, userId, command);
    revalidatePath("/opportunities");
    return { message: "Client créé.", success: true };
  } catch {
    return { message: "Vérifiez les informations du client.", success: false };
  }
}

export async function updateCustomerAction(
  _state: CommercialActionState,
  formData: FormData,
): Promise<CommercialActionState> {
  const { userId } = await requireOwner();

  try {
    const customerId = customerIdSchema.parse(formData.get("customerId"));
    const command = customerCommand(formData);
    const client = await createClient();
    await updateCustomer(client, userId, customerId, command);
    revalidatePath("/opportunities");
    return { message: "Client mis à jour.", success: true };
  } catch {
    return { message: "Impossible de mettre à jour ce client.", success: false };
  }
}

function deletionErrorMessage(error: unknown): string {
  if (error instanceof RepositoryError && error.code === "23503") {
    return "Ce client ne peut pas être supprimé tant qu’il est lié à des données commerciales.";
  }

  return "Impossible de supprimer ce client.";
}

export async function deleteCustomerAction(
  _state: CommercialActionState,
  formData: FormData,
): Promise<CommercialActionState> {
  const { userId } = await requireOwner();

  try {
    const customerId = customerIdSchema.parse(formData.get("customerId"));
    const client = await createClient();
    await deleteCustomer(client, userId, customerId);
    revalidatePath("/opportunities");
    return { message: "Client supprimé.", success: true };
  } catch (error) {
    return { message: deletionErrorMessage(error), success: false };
  }
}
