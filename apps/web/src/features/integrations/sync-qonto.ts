import "server-only";

import { randomUUID } from "node:crypto";

import {
  createQontoProvider,
  logSyncEvent,
  synchronizeBanking,
} from "@fc/integrations/server";
import type { SyncResult } from "@fc/integrations/server";

import { analyzeRecurringForOwner } from "@/features/recurring-detection/service";
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
    const bankingResult = await synchronizeBanking({
      ownerUserId,
      runId: randomUUID(),
      timezone: settings.timezone,
      provider: createQontoProvider(config),
      store: createBankingSyncStore(client),
      log: logSyncEvent,
    });
    if (bankingResult.success) {
      try { await analyzeRecurringForOwner(ownerUserId); }
      catch { /* Analysis never rolls back or masks a banking success. */ }
    }
    return bankingResult;
  } catch {
    return { success: false, code: "DATABASE_ERROR" };
  }
}
