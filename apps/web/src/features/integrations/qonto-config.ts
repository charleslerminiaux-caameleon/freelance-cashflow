import "server-only";

import { z } from "zod";
import { readSavedCredentials } from "./credential-store";

type QontoEnvironmentName = "QONTO_LOGIN" | "QONTO_SECRET_KEY";
type EnvironmentReader = (name: QontoEnvironmentName) => unknown;

const credentialSchema = z
  .string()
  .min(1)
  .max(500)
  .regex(/^[^\s\p{Cc}]+$/u);

export const qontoConfigSchema = z
  .object({
    login: credentialSchema.refine((value) => !value.includes(":")),
    secretKey: credentialSchema,
  })
  .strict();

export type QontoConfig = z.infer<typeof qontoConfigSchema>;

function processEnvironment(name: QontoEnvironmentName): unknown {
  return process.env[name];
}

export function loadQontoConfig(
  readEnvironment: EnvironmentReader = processEnvironment,
): QontoConfig | null {
  const saved = readEnvironment === processEnvironment ? readSavedCredentials("qonto") : undefined;
  if (saved !== undefined) {
    const parsed = qontoConfigSchema.safeParse(saved);
    return parsed.success ? parsed.data : null;
  }
  const parsed = qontoConfigSchema.safeParse({
    login: readEnvironment("QONTO_LOGIN"),
    secretKey: readEnvironment("QONTO_SECRET_KEY"),
  });
  return parsed.success ? parsed.data : null;
}

export function isQontoConfigured(
  readEnvironment: EnvironmentReader = processEnvironment,
): boolean {
  return loadQontoConfig(readEnvironment) !== null;
}
