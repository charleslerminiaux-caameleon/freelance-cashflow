import { localDate, moneyCents } from "@fc/shared";
import { z } from "zod";

import {
  businessDateSchema,
  moneyInputSchema,
  paymentTermsSchema,
  percentBasisPointsSchema,
} from "../commercial-schema";

function addDays(date: string, days: number) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return localDate(result.toISOString().slice(0, 10));
}

export const billingScheduleFormSchema = z
  .object({
    engagementId: z.string().uuid(),
    label: z.string().trim().min(1, "Le libellé est requis.").max(160),
    plannedInvoiceDate: businessDateSchema,
    amountHt: moneyInputSchema.refine((value) => value > 0, "Le montant doit être supérieur à zéro."),
    vatRatePercent: percentBasisPointsSchema,
    paymentTermsDays: paymentTermsSchema,
  })
  .transform(({ amountHt, vatRatePercent, ...value }) => {
    const vatCents = moneyCents(
      Number((BigInt(amountHt) * BigInt(vatRatePercent) + 5_000n) / 10_000n),
    );

    return {
      ...value,
      amountHtCents: amountHt,
      vatCents,
      amountTtcCents: moneyCents(amountHt + vatCents),
      expectedPaymentDate: addDays(value.plannedInvoiceDate, value.paymentTermsDays),
    };
  });

export type BillingScheduleCommand = z.infer<typeof billingScheduleFormSchema>;
