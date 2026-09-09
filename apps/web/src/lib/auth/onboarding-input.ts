import { parseAmountToCents } from "@fc/shared";
import { z } from "zod";

export const onboardingSchema = z.object({
  currency: z.literal("EUR"),
  timezone: z.string().min(1),
  country: z.literal("FR"),
  legalForm: z.string().max(80).optional(),
  openingBalance: z.string().min(1),
  safetyThreshold: z.string().min(1),
});

export type OnboardingInput = z.input<typeof onboardingSchema>;

export type OnboardingCommand = {
  currency: "EUR";
  timezone: string;
  country: "FR";
  legalForm: string | null;
  openingBalanceCents: number;
  safetyThresholdCents: number;
};

export function parseOnboardingInput(input: unknown): OnboardingCommand {
  const values = onboardingSchema.parse(input);
  const openingBalanceCents = parseAmountToCents(values.openingBalance);
  const safetyThresholdCents = parseAmountToCents(values.safetyThreshold);

  if (safetyThresholdCents < 0) {
    throw new Error("Le seuil de sécurité doit être positif ou nul.");
  }

  return {
    currency: values.currency,
    timezone: values.timezone,
    country: values.country,
    legalForm: values.legalForm ?? null,
    openingBalanceCents,
    safetyThresholdCents,
  };
}
