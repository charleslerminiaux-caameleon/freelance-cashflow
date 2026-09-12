export type QontoFreshness = "fresh" | "stale" | "error" | "unconfigured";

export function qontoFreshness({ lastSuccessAt, lastAttemptFailed, nowMs }: {
  lastSuccessAt: string | null;
  lastAttemptFailed: boolean;
  nowMs: number;
}): QontoFreshness {
  if (lastAttemptFailed) return "error";
  if (lastSuccessAt === null) return "unconfigured";
  const age = nowMs - Date.parse(lastSuccessAt);
  return Number.isFinite(age) && age >= 0 && age < 86_400_000 ? "fresh" : "stale";
}
