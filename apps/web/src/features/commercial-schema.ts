import { localDate, parseAmountToCents } from "@fc/shared";
import { z } from "zod";

function canParseAmount(value: string): boolean {
  try {
    parseAmountToCents(value);
    return true;
  } catch {
    return false;
  }
}

function isBusinessDate(value: string): boolean {
  try {
    localDate(value);
    return true;
  } catch {
    return false;
  }
}

export const moneyInputSchema = z
  .string()
  .trim()
  .refine(canParseAmount, "Saisissez un montant valide avec deux décimales maximum.")
  .transform((value) => parseAmountToCents(value));

export const businessDateSchema = z
  .string()
  .refine(isBusinessDate, "Saisissez une date valide.")
  .transform((value) => localDate(value));

export const optionalBusinessDateSchema = z.union([
  z.literal("").transform(() => null),
  businessDateSchema,
]);

export const paymentTermsSchema = z
  .string()
  .regex(/^\d+$/, "Saisissez un nombre entier de jours.")
  .transform(Number)
  .pipe(z.number().int().min(0).max(365));

export const percentBasisPointsSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(",", "."))
  .refine((value) => /^\d{1,3}(?:\.\d{1,2})?$/.test(value), "Saisissez un pourcentage valide.")
  .transform((value) => {
    const [whole = "0", decimals = ""] = value.split(".");
    return Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  })
  .pipe(z.number().int().min(0).max(10_000));

export const optionalTextSchema = (maximumLength: number) =>
  z
    .string()
    .trim()
    .max(maximumLength)
    .transform((value) => (value.length === 0 ? null : value));
