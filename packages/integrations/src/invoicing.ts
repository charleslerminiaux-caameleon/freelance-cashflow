import { localDate } from "@fc/shared";
import { z } from "zod";

// Future adapter boundary only: no provider payload, endpoint or authentication assumptions.
const identity = z.string().trim().min(1).max(500);
const cents = z.number().int().safe().nonnegative();
const businessDate = z.string().refine(value => {
  try { localDate(value); return true; } catch { return false; }
}, "Invalid business date");

export const normalizedCustomerSchema = z.object({
  externalId: identity,
  name: z.string().trim().min(1).max(500),
}).strict();

export const normalizedPaymentKnowledgeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unknown") }).strict(),
  z.object({
    kind: z.literal("known"),
    paidAmountCents: cents,
    // Business date; null means the payment amount is known but its date is not.
    paidAt: businessDate.nullable(),
  }).strict(),
]);

export const normalizedInvoiceSchema = z.object({
  externalId: identity,
  customer: normalizedCustomerSchema,
  invoiceNumber: identity,
  issuedAt: businessDate,
  dueAt: businessDate,
  amountHtCents: cents,
  amountVatCents: cents,
  amountTtcCents: cents,
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(["draft", "issued", "partially_paid", "paid", "overdue", "cancelled"]),
  payment: normalizedPaymentKnowledgeSchema,
}).strict().superRefine((invoice, context) => {
  if (BigInt(invoice.amountHtCents) + BigInt(invoice.amountVatCents) !== BigInt(invoice.amountTtcCents)) {
    context.addIssue({ code: "custom", message: "Invoice totals are inconsistent", path: ["amountTtcCents"] });
  }
  if (invoice.payment.kind === "known" && invoice.payment.paidAmountCents > invoice.amountTtcCents) {
    context.addIssue({ code: "custom", message: "Payment exceeds invoice total", path: ["payment"] });
  }
});

export type NormalizedCustomer = z.infer<typeof normalizedCustomerSchema>;
export type NormalizedInvoice = z.infer<typeof normalizedInvoiceSchema>;
export type NormalizedPaymentKnowledge = z.infer<typeof normalizedPaymentKnowledgeSchema>;
