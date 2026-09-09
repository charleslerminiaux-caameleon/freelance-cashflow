import { z } from "zod";

import { optionalTextSchema, paymentTermsSchema } from "../commercial-schema";

const optionalEmailSchema = z
  .string()
  .trim()
  .max(254)
  .refine((value) => value.length === 0 || z.string().email().safeParse(value).success, {
    message: "Saisissez une adresse e-mail valide.",
  })
  .transform((value) => (value.length === 0 ? null : value));

export const customerFormSchema = z.object({
  name: z.string().trim().min(1, "Le nom du client est requis.").max(160),
  email: optionalEmailSchema,
  paymentTermsDays: paymentTermsSchema,
  notes: optionalTextSchema(2_000),
});

export type CustomerCommand = z.infer<typeof customerFormSchema>;
