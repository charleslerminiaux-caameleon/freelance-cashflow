import "server-only";
import { readPublicConfig } from "./public";
import { parseServerEnv } from "./server-schema";
export function readServerConfig() {
  const { url, anonKey } = readPublicConfig();
  return parseServerEnv({
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
