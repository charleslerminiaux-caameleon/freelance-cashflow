import "server-only";

import { randomUUID } from "node:crypto";

import {
  createQontoProvider,
  logSyncEvent,
  synchronizeBanking,
} from "@fc/integrations/server";
import type { SyncResult } from "@fc/integrations/server";

import { getOwnerSettings } from "@/features/settings/repository";
import { createAdminClient } from "@/lib/supabase/admin";

import { loadQontoConfig } from "./qonto-config";
import { createBankingSyncStore } from "./sync-repository";

export async function synchronizeQontoForOwner(ownerUserId: string): Promise<SyncResult> {
  const config = loadQontoConfig();
  if (config === null) return { success: false, code: "PROVIDER_AUTH_EXPIRED" };

  try {
    const client = createAdminClient();
    const settings = await getOwnerSettings(client, ownerUserId);
    return await synchronizeBanking({
      ownerUserId,
      runId: randomUUID(),
      timezone: settings.timezone,
      provider: createQontoProvider(config),
      store: createBankingSyncStore(client),
      log: logSyncEvent,
    });
  } catch {
    return { success: false, code: "DATABASE_ERROR" };
  }
}
