"use server";

import { InvoiceCsvError, parseInvoiceCsv } from "@fc/integrations";
import { revalidatePath } from "next/cache";

import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";
import { RepositoryError } from "../repository-error";
import { createInvoice, importInvoiceRows, recordInvoicePayment } from "./repository";
import { invoiceFormSchema, paymentFormSchema } from "./schema";

export type InvoiceActionState = {
  completedIdempotencyKey?: string;
  message: string | null;
  success: boolean;
};

function manualInvoiceCommand(formData: FormData) {
  return invoiceFormSchema.parse({
    invoiceNumber: formData.get("invoiceNumber"),
    customerId: formData.get("customerId"),
    billingScheduleItemId: formData.get("billingScheduleItemId"),
    issuedAt: formData.get("issuedAt"),
    dueAt: formData.get("dueAt"),
    expectedPaymentDate: formData.get("expectedPaymentDate"),
    amountHt: formData.get("amountHt"),
    vat: formData.get("vat"),
  });
}

function invoiceErrorMessage(error: unknown): string {
  if (error instanceof RepositoryError) {
    if (error.code === "FC_INVOICE_NUMBER_CONFLICT") {
      return "Ce numéro existe déjà avec des informations différentes.";
    }
    if (error.code === "FC_SCHEDULE_ALREADY_INVOICED") {
      return "Cette étape de facturation a déjà été facturée.";
    }
    if (error.code === "FC_SCHEDULE_INVOICE_MISMATCH") {
      return "Le client et les montants doivent correspondre à l’étape de facturation sélectionnée.";
    }
    if (error.code === "FC_CUSTOMER_NOT_FOUND") {
      return "Le client sélectionné est introuvable.";
    }
  }
  return "Vérifiez les informations de la facture.";
}

export async function createInvoiceAction(
  _state: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const { userId } = await requireOwner();

  try {
    const command = manualInvoiceCommand(formData);
    const client = await createClient();
    await createInvoice(client, userId, command);
    revalidatePath("/invoices");
    revalidatePath("/engagements");
    return { message: "Facture créée.", success: true };
  } catch (error) {
    return { message: invoiceErrorMessage(error), success: false };
  }
}

function csvValidationMessage(error: InvoiceCsvError): string {
  const row = /^Row (\d+): (.+)$/u.exec(error.message);
  if (row) {
    const [, rowNumber, reason] = row;
    const translatedReasons: Record<string, string> = {
      "amount_ttc must equal amount_ht + vat": "le total TTC doit être égal au HT + TVA.",
      "due_at must not be before issued_at": "l’échéance ne peut pas précéder l’émission.",
      "invoice_number is duplicated in this file": "le numéro de facture est présent plusieurs fois.",
      "spreadsheet formulas are not allowed": "les formules de tableur ne sont pas autorisées.",
      "row must not be blank": "la ligne ne peut pas être vide.",
    };
    return `Ligne ${rowNumber} : ${translatedReasons[reason ?? ""] ?? "les données sont invalides."}`;
  }

  if (error.message.startsWith("Header must contain exactly")) {
    return "L’en-tête CSV doit contenir exactement les sept colonnes documentées.";
  }
  return "Le fichier CSV est invalide. Vérifiez son encodage et son format.";
}

function csvImportErrorMessage(error: unknown): string {
  if (error instanceof InvoiceCsvError) return csvValidationMessage(error);
  if (error instanceof RepositoryError) {
    if (error.code === "FC_INVOICE_NUMBER_CONFLICT") {
      return "Un numéro existe déjà avec des informations différentes. Corrigez le fichier avant de relancer l’import.";
    }
    if (error.code === "FC_CUSTOMER_NAME_NOT_FOUND") {
      return "Un client du fichier est introuvable. Créez-le puis relancez l’import.";
    }
    if (error.code === "FC_CUSTOMER_NAME_AMBIGUOUS") {
      return "Un nom de client correspond à plusieurs clients. Rendez les noms uniques puis réessayez.";
    }
  }
  return "L’import a échoué. Vérifiez le fichier puis réessayez.";
}

function csvFile(formData: FormData): File {
  const file = formData.get("csv");
  if (!(file instanceof File) || file.size === 0 || file.size > 1_000_000) {
    throw new InvoiceCsvError("CSV file is missing or too large");
  }
  return file;
}

function importSummary(createdCount: number, unchangedCount: number): string {
  const created = `${createdCount} créée${createdCount === 1 ? "" : "s"}`;
  const unchanged = `${unchangedCount} déjà présente${unchangedCount === 1 ? "" : "s"}`;
  return `Import terminé : ${created}, ${unchanged}.`;
}

export async function importInvoiceCsvAction(
  _state: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const { userId } = await requireOwner();

  try {
    const rows = parseInvoiceCsv(await csvFile(formData).text());
    const client = await createClient();
    const result = await importInvoiceRows(client, userId, rows);
    revalidatePath("/invoices");
    return {
      message: importSummary(result.createdCount, result.unchangedCount),
      success: true,
    };
  } catch (error) {
    return { message: csvImportErrorMessage(error), success: false };
  }
}

function paymentErrorMessage(error: unknown): string {
  if (error instanceof RepositoryError) {
    if (error.code === "FC_PAYMENT_EXCEEDS_BALANCE") {
      return "Le paiement dépasse le solde restant de la facture.";
    }
    if (error.code === "FC_PAYMENT_MUST_BE_POSITIVE") {
      return "Le paiement doit être supérieur à zéro.";
    }
    if (error.code === "FC_INVOICE_NOT_PAYABLE") {
      return "Cette facture ne peut pas recevoir de paiement.";
    }
  }
  return "Impossible d’enregistrer ce paiement. Vérifiez les informations.";
}

export async function recordInvoicePaymentAction(
  _state: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const { userId } = await requireOwner();

  try {
    const command = paymentFormSchema.parse({
      invoiceId: formData.get("invoiceId"),
      idempotencyKey: formData.get("idempotencyKey"),
      amount: formData.get("amount"),
      paidAt: formData.get("paidAt"),
    });
    const client = await createClient();
    await recordInvoicePayment(client, userId, command);
    revalidatePath(`/invoices/${command.invoiceId}`);
    revalidatePath("/invoices");
    return {
      completedIdempotencyKey: command.idempotencyKey,
      message: "Paiement enregistré.",
      success: true,
    };
  } catch (error) {
    return { message: paymentErrorMessage(error), success: false };
  }
}
