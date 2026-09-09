import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  password: z.string().min(8),
});

export type Credentials = z.infer<typeof credentialsSchema>;

export function parseCredentials(input: unknown): Credentials {
  return credentialsSchema.parse(input);
}
