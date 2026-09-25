"use client";
import { createBrowserClient } from "@supabase/ssr";
import { parsePublicEnv } from "@/lib/env/public-schema";
export async function createClient() {
  const response = await fetch("/api/runtime-config", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("Configuration indisponible");
  const input = await response.json();
  const config = parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: input.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: input.anonKey });
  return createBrowserClient(config.NEXT_PUBLIC_SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
