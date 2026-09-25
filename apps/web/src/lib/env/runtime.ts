import { parsePublicEnv } from "./public-schema";
export function readRuntimeConfig(env: Record<string, string | undefined>) {
  const parsed = parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: env.FC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.FC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  return { url: parsed.NEXT_PUBLIC_SUPABASE_URL, anonKey: parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}
