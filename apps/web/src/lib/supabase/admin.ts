import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { readServerConfig } from "@/lib/env/server";

export function createAdminClient() {
  const serverEnv = readServerConfig();
  return createSupabaseClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
