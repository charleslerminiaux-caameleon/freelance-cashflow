import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { readPublicConfig } from "@/lib/env/public";

export async function createClient() {
  const publicEnv = readPublicConfig();
  const cookieStore = await cookies();

  return createServerClient(
    publicEnv.url,
    publicEnv.anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot write cookies; src/proxy.ts refreshes them.
          }
        },
      },
    },
  );
}
