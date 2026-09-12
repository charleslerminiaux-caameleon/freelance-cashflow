import type { IntegrationErrorCode } from "@fc/integrations/server";
import type { AnalysisResult } from "@/features/recurring-detection/schema";

export type AutoSyncState = {
  phase: "idle" | "checking" | "syncing" | "error";
  lastErrorCode?: string;
};
export type AutoSyncActionResult = {
  status: "skipped" | "synced" | "error";
  code?: IntegrationErrorCode;
  analysisResult?: AnalysisResult;
  lastSuccessAt?: string;
};
export const AUTO_SYNC_CHECK_INTERVAL_MS = 300_000;
export const AUTO_SYNC_ERROR_COOLDOWN_MS = 900_000;

export function canCheckAutomatically(visible: boolean, inFlight: boolean, now: number, retryAfter: number): boolean {
  return visible && !inFlight && now >= retryAfter;
}
