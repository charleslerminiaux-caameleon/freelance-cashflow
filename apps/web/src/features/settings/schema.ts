import { z } from "zod";

import { moneyInputSchema, optionalTextSchema } from "../commercial-schema";

function isIanaTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export const settingsFormSchema = z
  .object({
    safetyThreshold: moneyInputSchema.refine(
      (value) => value >= 0,
      "Le seuil de sécurité doit être positif ou nul.",
    ),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine(isIanaTimezone, "Saisissez un fuseau horaire IANA valide."),
    legalForm: optionalTextSchema(80),
    defaultForecastHorizonDays: z
      .string()
      .regex(/^\d+$/, "Saisissez un nombre entier de jours.")
      .transform(Number)
      .pipe(z.number().int().min(1).max(366)),
    defaultScenario: z.enum(["certain", "committed", "probable"]),
  })
  .transform(
    ({ safetyThreshold, ...value }) => ({
      ...value,
      safetyCashThresholdCents: safetyThreshold,
    }),
  );

export type SettingsCommand = z.output<typeof settingsFormSchema>;
