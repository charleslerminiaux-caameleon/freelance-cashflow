"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  businessDateSchema,
  moneyInputSchema,
  percentBasisPointsSchema,
} from "@/features/commercial-schema";
import { expenseCertaintySchema } from "@/features/expenses/schema";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

import { confirmRecurringFromTransaction } from "./history-repository";
import { historyRecurringInputSchema } from "./history-schema";
import { detectionErrorCode, uuid, type DetectionCode } from "./schema";

export type HistoryActionState = {
  success: boolean;
  message: string | null;
  expenseId?: string;
};

const nullableUuid = z.union([z.literal("").transform(() => null), uuid]);
const positiveMoney = moneyInputSchema.refine((value) => value > 0);
const dayOfMonth = z
  .string()
  .regex(/^\d+$/u)
  .transform(Number)
  .pipe(z.number().int().min(1).max(31));

function failureMessage(code: DetectionCode): string {
  switch (code) {
    case "DETECTION_STALE":
    case "DETECTION_NOT_FOUND":
      return "Cette opération bancaire n’est plus à jour. Revenez à l’historique bancaire puis réessayez.";
    case "DETECTION_SOURCE_UNAVAILABLE":
      return "Aucune transaction bancaire publiée n’est disponible. Synchronisez votre banque puis réessayez.";
    case "DETECTION_DUPLICATE":
      return "Une charge mensuelle similaire existe. Associez-la ou confirmez explicitement la création.";
    case "DETECTION_INVALID":
      return "Impossible de créer cette charge récurrente. Vérifiez les informations saisies.";
    case "DETECTION_LOCKED":
      return "Une opération bancaire est en cours. Patientez puis réessayez.";
    case "DATABASE_ERROR":
      return "Impossible de créer cette charge récurrente. Réessayez.";
  }
}

function revalidateHistoryRecurringViews(): void {
  for (const path of ["/expenses", "/cashflow", "/dashboard"]) revalidatePath(path);
}

export async function createHistoryRecurringAction(
  _previous: HistoryActionState,
  formData: FormData,
): Promise<HistoryActionState> {
  const { userId } = await requireOwner();

  try {
    const existingExpenseId = nullableUuid.parse(formData.get("existingExpenseId") ?? "");
    const input = historyRecurringInputSchema.parse({
      transactionId: formData.get("transactionId"),
      sourcePublication: formData.get("sourcePublication"),
      command: {
        label: formData.get("label"),
        amount_cents: positiveMoney.parse(formData.get("amount")),
        day_of_month: dayOfMonth.parse(formData.get("dayOfMonth")),
        start_date: businessDateSchema.parse(formData.get("startDate")),
        category_id: nullableUuid.parse(formData.get("categoryId") ?? ""),
        cashflow_kind: "expense",
        certainty: expenseCertaintySchema.parse(formData.get("certainty")),
        probability_basis_points: percentBasisPointsSchema.parse(
          formData.get("probabilityPercent"),
        ),
      },
      existingExpenseId,
      allowDuplicate: existingExpenseId === null && formData.get("allowDuplicate") === "on",
      allowRecreate: formData.get("allowRecreate") === "on",
    });
    const client = await createClient();
    const expenseId = await confirmRecurringFromTransaction(client, userId, input);
    revalidateHistoryRecurringViews();
    return {
      success: true,
      message:
        existingExpenseId === null
          ? "Charge récurrente créée depuis l’historique."
          : "Opération associée à la charge existante.",
      expenseId,
    };
  } catch (error) {
    const code = error instanceof z.ZodError ? "DETECTION_INVALID" : detectionErrorCode(error);
    return { success: false, message: failureMessage(code) };
  }
}
