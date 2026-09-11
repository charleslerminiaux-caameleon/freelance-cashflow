import "server-only";

import { randomUUID } from "node:crypto";

import {
  createQontoProvider,
  logSyncEvent,
  synchronizeBanking,
} from "@fc/integrations/server";
import type { SyncResult } from "@fc/integrations/server";

import { analyzeRecurringForOwner } from "@/features/recurring-detection/service";
import type { AnalysisResult } from "@/features/recurring-detection/schema";
import { getOwnerSettings } from "@/features/settings/repository";
import { createAdminClient } from "@/lib/supabase/admin";

import { loadQontoConfig } from "./qonto-config";
import { createBankingSyncStore } from "./sync-repository";

export type QontoSyncResult =
  | Extract<SyncResult, { success: false }>
  | (Extract<SyncResult, { success: true }> & { analysisResult: AnalysisResult });

export async function synchronizeQontoForOwner(ownerUserId: string): Promise<QontoSyncResult> {
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
      let analysisResult: AnalysisResult;
      try {
        analysisResult = await analyzeRecurringForOwner(ownerUserId);
      } catch {
        analysisResult = { success: false, code: "DATABASE_ERROR" };
      }
      return { ...bankingResult, analysisResult };
    }
    return bankingResult;
  } catch {
    return { success: false, code: "DATABASE_ERROR" };
  }
}
