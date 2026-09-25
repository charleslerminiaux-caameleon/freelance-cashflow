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

import { confirmSuggestion, setSuggestionState } from "./repository";
import {
  confirmationSchema,
  detectionErrorCode,
  uuid,
  type DetectionCode,
} from "./schema";
import { analyzeRecurringForOwner } from "./service";

export type SuggestionActionState = {
  success: boolean;
  message: string | null;
};

const categoryIdSchema = z.union([z.literal("").transform(() => null), uuid]);
const existingExpenseIdSchema = z.union([z.literal("").transform(() => null), uuid]);
const positiveMoneySchema = moneyInputSchema.refine((value) => value > 0);
const daySchema = z
  .string()
  .regex(/^\d+$/u)
  .transform(Number)
  .pipe(z.number().int().min(1).max(31));

function revalidateRecurringViews() {
  for (const path of ["/expenses", "/dashboard", "/cashflow", "/integrations"]) {
    revalidatePath(path);
  }
}

function confirmationMessage(code: DetectionCode): string {
  switch (code) {
    case "DETECTION_STALE":
    case "DETECTION_NOT_FOUND":
      return "Cette suggestion n’est plus à jour. Relancez l’analyse des transactions importées.";
    case "DETECTION_DUPLICATE":
      return "Une charge mensuelle similaire existe. Associez-la ou confirmez explicitement la création.";
    case "DETECTION_LOCKED":
      return "Une analyse est en cours. Patientez puis réessayez.";
    case "DETECTION_SOURCE_UNAVAILABLE":
      return "Aucune transaction bancaire publiée n’est disponible. Synchronisez votre banque puis relancez l’analyse.";
    case "DETECTION_INVALID":
      return "Impossible de confirmer cette récurrence. Vérifiez les informations saisies.";
    case "DATABASE_ERROR":
      return "Impossible de confirmer cette récurrence. Réessayez.";
  }
}

function analysisMessage(code: DetectionCode): string {
  switch (code) {
    case "DETECTION_LOCKED":
      return "Une analyse est déjà en cours. Patientez puis réessayez.";
    case "DETECTION_SOURCE_UNAVAILABLE":
      return "Aucune transaction importée n’est disponible. Synchronisez votre banque avant d’analyser.";
    case "DETECTION_STALE":
      return "Les données bancaires ont changé pendant l’analyse. Relancez l’analyse.";
    default:
      return "L’analyse des récurrences a échoué. Réessayez.";
  }
}

export async function confirmSuggestionAction(
  _state: SuggestionActionState,
  formData: FormData,
): Promise<SuggestionActionState> {
  const { userId } = await requireOwner();

  try {
    const existingExpenseId = existingExpenseIdSchema.parse(
      formData.get("existingExpenseId") ?? "",
    );
    const input = confirmationSchema.parse({
      suggestionId: formData.get("suggestionId"),
      sourcePublication: formData.get("sourcePublication"),
      command: {
        label: formData.get("label"),
        amount_cents: positiveMoneySchema.parse(formData.get("amount")),
        day_of_month: daySchema.parse(formData.get("dayOfMonth")),
        start_date: businessDateSchema.parse(formData.get("startDate")),
        category_id: categoryIdSchema.parse(formData.get("categoryId") ?? ""),
        cashflow_kind: "expense",
        certainty: expenseCertaintySchema.parse(formData.get("certainty")),
        probability_basis_points: percentBasisPointsSchema.parse(
          formData.get("probabilityPercent"),
        ),
      },
      existingExpenseId,
      allowDuplicate: existingExpenseId === null && formData.get("allowDuplicate") === "on",
    });
    const client = await createClient();
    await confirmSuggestion(client, userId, input);
    revalidateRecurringViews();
    return {
      success: true,
      message:
        existingExpenseId === null
          ? "Récurrence confirmée."
          : "Récurrence associée à la charge existante.",
    };
  } catch (error) {
    const code = error instanceof z.ZodError ? "DETECTION_INVALID" : detectionErrorCode(error);
    return { success: false, message: confirmationMessage(code) };
  }
}

async function changeSuggestionState(
  formData: FormData,
  action: "dismiss" | "reexamine",
): Promise<SuggestionActionState> {
  const { userId } = await requireOwner();

  try {
    const suggestionId = uuid.parse(formData.get("suggestionId"));
    const client = await createClient();
    await setSuggestionState(client, userId, suggestionId, action);
    revalidateRecurringViews();
    return action === "dismiss"
      ? { success: true, message: "Suggestion ignorée." }
      : {
          success: true,
          message: "Suggestion à réexaminer lors de la prochaine analyse.",
        };
  } catch (error) {
    const code = detectionErrorCode(error);
    return {
      success: false,
      message:
        code === "DETECTION_STALE" || code === "DETECTION_NOT_FOUND"
          ? "Cette suggestion n’est plus à jour. Relancez l’analyse."
          : "Impossible de modifier cette suggestion. Réessayez.",
    };
  }
}

export async function dismissSuggestionAction(
  _state: SuggestionActionState,
  formData: FormData,
): Promise<SuggestionActionState> {
  return changeSuggestionState(formData, "dismiss");
}

export async function reexamineSuggestionAction(
  _state: SuggestionActionState,
  formData: FormData,
): Promise<SuggestionActionState> {
  return changeSuggestionState(formData, "reexamine");
}

export async function analyzeRecurringAction(
  _state: SuggestionActionState,
  _formData: FormData,
): Promise<SuggestionActionState> {
  const { userId } = await requireOwner();
  void _state;
  void _formData;

  try {
    const results = await Promise.all((["qonto", "revolut", "bunq"] as const).map(provider => analyzeRecurringForOwner(userId, provider)));
    const successes = results.filter(result => result.success);
    const failure = results.find(result => !result.success && result.code !== "DETECTION_SOURCE_UNAVAILABLE");
    if (successes.length) revalidateRecurringViews();
    if (failure && !failure.success) return { success: false, message: analysisMessage(failure.code) };
    if (!successes.length) return { success: false, message: analysisMessage("DETECTION_SOURCE_UNAVAILABLE") };
    const count = successes.reduce((total, result) => total + result.count, 0);
    return {
      success: true,
      message: `Analyse terminée : ${count} récurrence${count === 1 ? "" : "s"} détectée${count === 1 ? "" : "s"}.`,
    };
  } catch {
    return { success: false, message: analysisMessage("DATABASE_ERROR") };
  }
}
