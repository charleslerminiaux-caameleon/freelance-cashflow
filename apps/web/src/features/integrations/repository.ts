import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { IntegrationState } from "./status";

const integrationSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["not_connected", "syncing", "connected", "error", "awaiting_api_access"]),
  last_connection_succeeded: z.boolean().nullable(),
  last_success_at: z.string().datetime({ offset: true }).nullable(),
  last_error_code: z.enum(["PROVIDER_AUTH_EXPIRED", "PROVIDER_RATE_LIMIT", "PROVIDER_UNAVAILABLE", "PROVIDER_INVALID_RESPONSE", "SYNC_LOCKED", "DATABASE_ERROR"]).nullable(),
});

export async function getQontoIntegration(client: SupabaseClient, ownerUserId: string, signal = new AbortController().signal): Promise<IntegrationState | null> {
  try {
    z.string().uuid().parse(ownerUserId);
    // Explicit signals opt out of Next render GET memoization. The repeated
    // publication-marker reads must each observe the current database state.
    const { data, error } = await client.from("integrations")
      .select("id, status, last_connection_succeeded, last_success_at, last_error_code")
      .eq("owner_user_id", ownerUserId).eq("provider", "qonto")
      .abortSignal(signal).maybeSingle();
    if (error) throw new Error("DATABASE_ERROR");
    return data === null ? null : integrationSchema.parse(data);
  } catch { throw new Error("DATABASE_ERROR"); }
}

export async function getDirectIntegrations(client: SupabaseClient, ownerUserId: string) {
  const { data, error } = await client.from("integrations")
    .select("provider, id, status, last_connection_succeeded, last_success_at, last_error_code")
    .eq("owner_user_id", z.string().uuid().parse(ownerUserId)).in("provider", ["pennylane", "revolut", "bunq"]);
  if (error) throw new Error("DATABASE_ERROR");
  return z.array(integrationSchema.extend({ provider: z.enum(["pennylane", "revolut", "bunq"]) })).parse(data);
}
