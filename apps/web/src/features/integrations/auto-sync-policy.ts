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

export function canCheckAutomatically(visible: boolean, inFlight: boolean): boolean {
  return visible && !inFlight;
}

/** Recovery evidence must describe an actual publication, never a future date. */
export function publicationTimestamp(value: string | null | undefined, now: number): number | null {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) && timestamp <= now ? timestamp : null;
}
