import { z } from "zod";

import {
  businessDateSchema,
  moneyInputSchema,
  optionalBusinessDateSchema,
  optionalTextSchema,
  paymentTermsSchema,
  percentBasisPointsSchema,
} from "../commercial-schema";

export const opportunityStatusSchema = z.enum([
  "lead",
  "qualified",
  "proposal",
  "won",
  "lost",
]);

export const opportunityFormSchema = z
  .object({
    customerId: z.string().uuid(),
    name: z.string().trim().min(1, "Le nom de l’opportunité est requis.").max(200),
    status: opportunityStatusSchema,
    estimatedAmountHt: moneyInputSchema.refine((value) => value >= 0, "Le montant doit être positif."),
    probabilityPercent: percentBasisPointsSchema,
    expectedCloseDate: optionalBusinessDateSchema,
    expectedStartDate: optionalBusinessDateSchema,
    expectedEndDate: optionalBusinessDateSchema,
    notes: optionalTextSchema(2_000),
  })
  .transform(({ estimatedAmountHt, probabilityPercent, ...value }) => ({
    ...value,
    estimatedAmountHtCents: estimatedAmountHt,
    probabilityBasisPoints: probabilityPercent,
  }))
  .superRefine((value, context) => {
    if (
      value.expectedStartDate !== null &&
      value.expectedEndDate !== null &&
      value.expectedEndDate < value.expectedStartDate
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La date de fin doit suivre la date de début.",
        path: ["expectedEndDate"],
      });
    }
  });

export const conversionFormSchema = z
  .object({
    opportunityId: z.string().uuid(),
    reference: z.string().trim().min(1, "La référence est requise.").max(160),
    signedAt: businessDateSchema,
    vatRatePercent: percentBasisPointsSchema,
    paymentTermsDays: paymentTermsSchema,
  })
  .transform(({ vatRatePercent, ...value }) => ({
    ...value,
    vatRateBasisPoints: vatRatePercent,
  }));

export type OpportunityCommand = z.infer<typeof opportunityFormSchema>;
export type ConversionCommand = z.infer<typeof conversionFormSchema>;
export type OpportunityStatus = z.infer<typeof opportunityStatusSchema>;
