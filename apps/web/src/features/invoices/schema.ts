import { moneyCents } from "@fc/shared";
import { z } from "zod";

import { businessDateSchema, moneyInputSchema } from "../commercial-schema";

const nonNegativeMoneyInputSchema = moneyInputSchema.refine(
  (value) => value >= 0,
  "Le montant ne peut pas être négatif.",
);

const optionalScheduleIdSchema = z.union([
  z.literal("").transform(() => null),
  z.string().uuid(),
]);

export const invoiceFormSchema = z
  .object({
    invoiceNumber: z.string().trim().min(1, "Le numéro de facture est requis.").max(160),
    customerId: z.string().uuid(),
    billingScheduleItemId: optionalScheduleIdSchema,
    issuedAt: businessDateSchema,
    dueAt: businessDateSchema,
    expectedPaymentDate: businessDateSchema,
    amountHt: nonNegativeMoneyInputSchema,
    vat: nonNegativeMoneyInputSchema,
  })
  .superRefine((invoice, context) => {
    if (invoice.dueAt < invoice.issuedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dueAt"],
        message: "L’échéance ne peut pas précéder l’émission.",
      });
    }

    if (invoice.expectedPaymentDate < invoice.issuedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedPaymentDate"],
        message: "La date d’encaissement prévue ne peut pas précéder l’émission.",
      });
    }

    if (!Number.isSafeInteger(invoice.amountHt + invoice.vat)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vat"],
        message: "Le total TTC dépasse la limite prise en charge.",
      });
    }
  })
  .transform(({ amountHt, vat, ...invoice }) => ({
    ...invoice,
    amountHtCents: amountHt,
    vatCents: vat,
    amountTtcCents: moneyCents(amountHt + vat),
  }));

export const paymentFormSchema = z
  .object({
    invoiceId: z.string().uuid(),
    idempotencyKey: z.string().uuid(),
    amount: moneyInputSchema.refine(
      (value) => value > 0,
      "Le paiement doit être supérieur à zéro.",
    ),
    paidAt: businessDateSchema,
  })
  .transform(({ amount, ...payment }) => ({
    ...payment,
    amountCents: amount,
  }));

export type InvoiceCommand = z.infer<typeof invoiceFormSchema>;
export type PaymentCommand = z.infer<typeof paymentFormSchema>;
