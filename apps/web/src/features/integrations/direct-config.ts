import "server-only";
import { resolve } from "node:path";
import { z } from "zod";

export type DirectProvider = "pennylane" | "revolut" | "bunq";
type Reader = (name: string) => unknown;
const secret = z.string().min(1).max(8192).regex(/^[^\s\p{Cc}]+$/u);
const schemas = {
  pennylane: z.object({ token: secret }),
  revolut: z.object({ clientId: secret, refreshToken: secret, issuer: secret,
    privateKey: z.string().min(100).max(16384).refine(value => value.includes("PRIVATE KEY-----")),
  }),
  bunq: z.object({ apiKey: secret, contextPath: z.string().min(1).max(4096) }),
};
type Configs = { [K in DirectProvider]: z.infer<typeof schemas[K]> };
export function loadDirectConfig<P extends DirectProvider>(provider: P, read: Reader = name => process.env[name]): Configs[P] | null {
  const privateKey = provider === "revolut" ? read("REVOLUT_PRIVATE_KEY") : undefined;
  const input = provider === "pennylane" ? { token: read("PENNYLANE_API_TOKEN") }
    : provider === "revolut" ? { clientId: read("REVOLUT_CLIENT_ID"), refreshToken: read("REVOLUT_REFRESH_TOKEN"),
      issuer: read("REVOLUT_ISSUER"), privateKey: typeof privateKey === "string" ? privateKey.replace(/\\n/g, "\n") : privateKey }
      : { apiKey: read("BUNQ_API_KEY"), contextPath: read("BUNQ_CONTEXT_PATH") || resolve(process.cwd(), ".libra/bunq-context.json") };
  const parsed = schemas[provider].safeParse(input);
  return parsed.success ? parsed.data as Configs[P] : null;
}
