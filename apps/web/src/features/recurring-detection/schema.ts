import { z } from "zod";
import { businessDateSchema } from "@/features/commercial-schema";

export type RecurringBankProvider = "qonto" | "revolut" | "bunq";

export const detectionCodeSchema = z.enum(["DETECTION_LOCKED", "DETECTION_STALE", "DETECTION_INVALID", "DETECTION_DUPLICATE", "DETECTION_NOT_FOUND", "DETECTION_SOURCE_UNAVAILABLE", "DATABASE_ERROR"]);
export type DetectionCode = z.infer<typeof detectionCodeSchema>;
export type AnalysisResult = { success: true; count: number } | { success: false; code: DetectionCode };
export function detectionErrorCode(error: unknown): DetectionCode {
  const message = error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? error.message : null;
  const parsed = detectionCodeSchema.safeParse(message);
  return parsed.success ? parsed.data : "DATABASE_ERROR";
}
export const uuid = z.string().uuid();
export const publicationSchema = z.string().datetime({ offset: true });
const amount = z.number().int().safe().positive();
export const confirmationSchema = z.object({
  suggestionId: uuid, sourcePublication: publicationSchema,
  command: z.object({
    label: z.string().trim().min(1).max(160), amount_cents: amount,
    day_of_month: z.number().int().min(1).max(31), start_date: businessDateSchema,
    category_id: uuid.nullable().optional(), cashflow_kind: z.literal("expense"),
    certainty: z.enum(["certain", "committed", "probable"]),
    probability_basis_points: z.number().int().min(0).max(10000),
  }).strict(),
  existingExpenseId: uuid.nullable().optional(), allowDuplicate: z.boolean().optional(),
}).strict();
export type ConfirmSuggestionInput = z.infer<typeof confirmationSchema>;
export const suggestionRowSchema = z.object({
  id: uuid, owner_user_id: uuid, integration_id: uuid, bank_account_id: uuid,
  currency: z.string().regex(/^[A-Z]{3}$/), normalized_label: z.string().min(1),
  creation_source: z.enum(["detected", "history"]),
  state: z.enum(["pending", "confirmed", "dismissed"]), eligible: z.boolean(),
  label: z.string().min(1).max(160), amount_cents: amount, day_of_month: z.number().int().min(1).max(31),
  last_payment_date: businessDateSchema, next_date: businessDateSchema,
  source_publication: publicationSchema, recurring_cashflow_id: uuid.nullable(),
});
export type SuggestionRow = z.infer<typeof suggestionRowSchema>;
export type RecurringSuggestion = {
  provider?: RecurringBankProvider;
  creationSource: "detected" | "history";
  id: string; state: "pending" | "confirmed" | "dismissed"; eligible: boolean;
  label: string; amountCents: number; dayOfMonth: number; nextDate: string;
  lastPaymentDate: string; sourcePublication: string; linkedExpenseId: string | null;
  accountId: string; currency: string; normalizedLabel: string;
  evidence: { id: string; label: string; amountCents: number; transactionDate: string }[];
  possibleDuplicates: { id: string; label: string; amountCents: number }[];
};
export type RecurringSuggestionWorkspace = {
  suggestions: RecurringSuggestion[]; ignored: RecurringSuggestion[];
  linkedExpenseOrigins: Record<string, "detected" | "history">;
  linkedExpenseIds: string[]; lastAnalyzedAt: string | null; analysisError: string | null;
};
