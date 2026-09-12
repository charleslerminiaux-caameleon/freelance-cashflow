import { z } from "zod";
import { businessDateSchema } from "@/features/commercial-schema";
import { confirmationSchema, publicationSchema, uuid } from "./schema";

export const historyRecurringInputSchema = confirmationSchema.omit({ suggestionId: true }).extend({
  transactionId: uuid, allowRecreate: z.boolean().optional(),
}).strict();
export type HistoryRecurringInput = z.infer<typeof historyRecurringInputSchema>;
const expense = z.object({ id: uuid, label: z.string(), amountCents: z.number().int().safe().positive() });
export const historyRecurringWorkspaceSchema = z.object({
  transactionId: uuid, sourcePublication: publicationSchema,
  label: z.string().min(1).max(160), amountCents: z.number().int().safe().positive(),
  dayOfMonth: z.number().int().min(1).max(31), nextDate: businessDateSchema,
  currency: z.string().regex(/^[A-Z]{3}$/), seriesState: z.enum(["pending", "confirmed", "dismissed"]).nullable(),
  linkedExpenseId: uuid.nullable(), possibleDuplicates: z.array(expense), existingExpenses: z.array(expense),
  categories: z.array(z.object({ id: uuid, name: z.string() })),
});
export type HistoryRecurringWorkspace = z.infer<typeof historyRecurringWorkspaceSchema>;
