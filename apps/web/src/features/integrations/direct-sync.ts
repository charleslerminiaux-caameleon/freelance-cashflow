import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createPennylaneProvider, createRevolutProvider, createBunqProvider, synchronizeBanking, IntegrationError, SyncStoreError } from "@fc/integrations/server";
import type { IntegrationErrorCode } from "@fc/integrations/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeRecurringForOwner, type AnalysisResult } from "@/features/recurring-detection/service";
import { getOwnerSettings } from "@/features/settings/repository";
import { loadDirectConfig, type DirectProvider } from "./direct-config";
import { createBankingSyncStore } from "./sync-repository";

export type DirectSyncResult = { success: true; created: number; updated: number; skippedDrafts?: number; skippedCreditNotes?: number; analysisResult?: AnalysisResult; skipped?: false }
  | { success: true; skipped: true }
  | { success: false; code: IntegrationErrorCode };
const publication = z.object({ created: z.number().int().nonnegative(), updated: z.number().int().nonnegative() });
const failureCode = (error: unknown): IntegrationErrorCode => error instanceof IntegrationError || error instanceof SyncStoreError ? error.code : "DATABASE_ERROR";

export async function synchronizeDirectForOwner(ownerUserId: string, provider: DirectProvider, options?: { mode?: "manual" | "automatic" }): Promise<DirectSyncResult> {
  if (!loadDirectConfig(provider)) return options?.mode === "automatic" ? { success: true, skipped: true } : { success: false, code: "PROVIDER_AUTH_EXPIRED" };
  const client = createAdminClient();
  const runId = randomUUID();
  const store = createBankingSyncStore(client, { provider, ...options });
  try {
    if (provider !== "pennylane") {
      const bank = provider === "revolut" ? createRevolutProvider(loadDirectConfig("revolut")!) : createBunqProvider(loadDirectConfig("bunq")!);
      const settings = await getOwnerSettings(client, ownerUserId);
      const result = await synchronizeBanking({ ownerUserId, runId, timezone: settings.timezone, provider: bank, store });
      if (!result.success || result.skipped) return result;
      let analysisResult: AnalysisResult;
      try { analysisResult = await analyzeRecurringForOwner(ownerUserId, provider); }
      catch { analysisResult = { success: false, code: "DATABASE_ERROR" }; }
      return { ...result, analysisResult };
    }
    const signal = AbortSignal.timeout(150_000);
    const lease = await store.acquire(ownerUserId, runId, signal);
    if (!lease) return { success: true, skipped: true };
    let connectionSucceeded = false;
    const lostLease = new AbortController();
    let heartbeatError: unknown;
    let renewing = Promise.resolve();
    const heartbeat = setInterval(() => {
      renewing = renewing.then(async () => {
        if (lostLease.signal.aborted) return;
        try { await store.renew(ownerUserId, runId, AbortSignal.timeout(10_000)); }
        catch (error) { heartbeatError = error; lostLease.abort(); }
      });
    }, 20_000);
    try {
      const snapshot = await createPennylaneProvider(loadDirectConfig("pennylane")!).readInvoices(AbortSignal.any([signal, lostLease.signal]));
      connectionSucceeded = true;
      clearInterval(heartbeat);
      await renewing;
      if (heartbeatError) throw heartbeatError;
      // A commit may succeed while its response is lost. Replay the same fenced run.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { data, error, status } = await client.rpc("publish_pennylane_sync", {
            p_owner_user_id: ownerUserId, p_run_id: runId, p_invoices: snapshot.invoices,
          }).abortSignal(AbortSignal.any([signal, AbortSignal.timeout(15_000)]));
          if (error) throw new SyncStoreError("DATABASE_ERROR", status === 0 || status >= 500);
          return { success: true, ...publication.parse(data), skippedDrafts: snapshot.skippedDrafts, skippedCreditNotes: snapshot.skippedCreditNotes };
        } catch (error) {
          if (attempt === 1 || signal.aborted || (error instanceof SyncStoreError && !error.transient)) throw error;
        }
      }
      throw new SyncStoreError("DATABASE_ERROR", false);
    } catch (error) {
      const code = failureCode(heartbeatError ?? error);
      try { await store.fail(ownerUserId, runId, code, connectionSucceeded, AbortSignal.timeout(5_000)); } catch { /* Lease recovery preserves previous publication. */ }
      return { success: false, code };
    } finally { clearInterval(heartbeat); lostLease.abort(); await renewing; }
  } catch (error) { return { success: false, code: failureCode(error) }; }
}
