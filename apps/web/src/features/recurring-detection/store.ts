import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getBankingSnapshot } from "@/features/banking/repository";
import { getOwnerSettings } from "@/features/settings/repository";
import { detectionErrorCode, publicationSchema, uuid } from "./schema";
import { recurringHistoryWindow } from "./history-window";
import type { AnalysisStore } from "./service";

async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown>, signal: AbortSignal) {
  try {
    signal.throwIfAborted();
    const { data, error } = await client.rpc(name, args).abortSignal(signal);
    if (error) throw error;
    return data;
  } catch (error) { throw new Error(detectionErrorCode(error)); }
}
export function createAnalysisStore(client: SupabaseClient): AnalysisStore {
  return {
    async acquire(owner, runId, signal) {
      const data = await rpc(client, "acquire_recurring_analysis", { p_owner_user_id: owner, p_run_id: runId }, signal);
      const lease = z.object({ integration_id: uuid, source_publication: publicationSchema, lease_expires_at: publicationSchema }).parse(data);
      return { integrationId: lease.integration_id, sourcePublication: lease.source_publication };
    },
    settings: (owner, signal) => getOwnerSettings(client, owner, signal),
    snapshot: (owner, today, signal) => getBankingSnapshot(client, owner, { provider: "qonto", fullHistory: recurringHistoryWindow(today), signal }),
    async publish(owner, runId, marker, candidates, signal) {
      await rpc(client, "publish_recurring_analysis", { p_owner_user_id: owner, p_run_id: runId, p_source_publication: marker,
        p_candidates: candidates.map(item => ({ account_id: item.accountId, currency: item.currency, normalized_label: item.normalizedLabel,
          label: item.label, amount_cents: item.amountCents, day_of_month: item.dayOfMonth, last_payment_date: item.lastPaymentDate,
          next_date: item.nextDate, transaction_ids: item.transactionIds })),
      }, signal);
    },
    async runState(owner, integrationId, signal) {
      const { data, error } = await client.from("recurring_detection_runs").select("lease_run_id, lease_expires_at")
        .eq("owner_user_id", owner).eq("integration_id", integrationId).abortSignal(signal).maybeSingle();
      if (error) throw new Error("DATABASE_ERROR");
      if (!data) return null;
      const row = z.object({ lease_run_id: uuid.nullable(), lease_expires_at: publicationSchema.nullable() }).parse(data);
      return { leaseRunId: row.lease_run_id, leaseExpiresAt: row.lease_expires_at };
    },
    async fail(owner, runId, code, signal) {
      await rpc(client, "fail_recurring_analysis", { p_owner_user_id: owner, p_run_id: runId, p_error_code: code }, signal);
    },
  };
}
