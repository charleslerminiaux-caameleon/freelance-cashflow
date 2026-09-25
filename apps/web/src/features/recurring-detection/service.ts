import "server-only";
import { detectMonthlyOutflows, type RecurringCandidate } from "@fc/domain";
import { localDate } from "@fc/shared";
import { detectionTransactions, type ObservedTransaction } from "./forecast";
import { detectionErrorCode, uuid, type AnalysisResult, type DetectionCode, type RecurringBankProvider } from "./schema";

export type AnalysisSnapshot = {
  integration: { id: string; last_success_at: string | null } | null;
  accounts: { id: string; currency: string; status: string; is_current: boolean }[];
  fullTransactions?: ObservedTransaction[];
};
export type AnalysisStore = {
  acquire(owner: string, runId: string, signal: AbortSignal): Promise<{ integrationId: string; sourcePublication: string }>;
  settings(owner: string, signal: AbortSignal): Promise<{ timezone: string; currency: string }>;
  snapshot(owner: string, today: string, signal: AbortSignal): Promise<AnalysisSnapshot>;
  publish(owner: string, runId: string, marker: string, candidates: RecurringCandidate[], signal: AbortSignal): Promise<void>;
  runState(owner: string, integrationId: string, signal: AbortSignal): Promise<{ leaseRunId: string | null; leaseExpiresAt: string | null } | null>;
  fail(owner: string, runId: string, code: DetectionCode, signal: AbortSignal): Promise<void>;
};
export type AnalysisDependencies = { store: AnalysisStore; runId(): string; now(): Date; monotonicNow?: () => number; detect?: typeof detectMonthlyOutflows };

// Each awaited operation races cancellation, including injected stores that do not
// cooperate. Abort also prevents a timed-out continuation from publishing later.
async function bounded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let rejectAbort: () => void = () => {};
  const abort = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(new Error("DATABASE_ERROR"));
    signal.addEventListener("abort", rejectAbort, { once: true });
  });
  try { return await Promise.race([promise, abort]); }
  finally { signal.removeEventListener("abort", rejectAbort); }
}
export async function analyzeRecurring(owner: string, deps: AnalysisDependencies): Promise<AnalysisResult> {
  const monotonicNow = deps.monotonicNow ?? (() => performance.now());
  const startedAt = monotonicNow();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40_000);
  const signal = controller.signal;
  const assertWithinBudget = () => {
    signal.throwIfAborted();
    if (monotonicNow() - startedAt >= 40_000) throw new Error("DATABASE_ERROR");
  };
  let runId: string | undefined;
  let integrationId: string | undefined;
  try {
    if (!uuid.safeParse(owner).success) throw new Error("DETECTION_INVALID");
    runId = uuid.parse(deps.runId());
    const lease = await bounded(deps.store.acquire(owner, runId, signal), signal);
    integrationId = lease.integrationId;
    const settings = await bounded(deps.store.settings(owner, signal), signal);
    const today = localDate(new Intl.DateTimeFormat("sv-SE", { timeZone: settings.timezone }).format(deps.now()));
    const snapshot = await bounded(deps.store.snapshot(owner, today, signal), signal);
    if (snapshot.integration?.id !== integrationId || snapshot.integration.last_success_at !== lease.sourcePublication) throw new Error("DETECTION_STALE");
    if (!snapshot.fullTransactions || snapshot.fullTransactions.length > 100_000) throw new Error("DATABASE_ERROR");
    assertWithinBudget();
    const candidates = (deps.detect ?? detectMonthlyOutflows)({ today, currency: settings.currency,
      accounts: snapshot.accounts.map(row => ({ id: row.id, currency: row.currency, active: row.status === "active", current: row.is_current })),
      transactions: detectionTransactions(snapshot.fullTransactions),
    }, assertWithinBudget);
    if (candidates.length > 10_000) throw new Error("DATABASE_ERROR");
    assertWithinBudget();
    // SQL rechecks the exact current publication and live fenced lease atomically.
    await bounded(deps.store.publish(owner, runId, lease.sourcePublication, candidates, signal), signal);
    return { success: true, count: candidates.length };
  } catch (error) {
    const code = detectionErrorCode(error);
    const cleanupBudget = Math.min(5_000, startedAt + 45_000 - monotonicNow());
    if (runId && integrationId && cleanupBudget > 0) {
      const cleanup = new AbortController();
      const cleanupTimer = setTimeout(() => cleanup.abort(), cleanupBudget);
      try {
        const state = await bounded(deps.store.runState(owner, integrationId, cleanup.signal), cleanup.signal);
        // Uncertain publish responses are not retried: released/replaced runs may
        // already have succeeded. Never overwrite their metadata or decisions.
        if (!cleanup.signal.aborted && monotonicNow() < startedAt + 45_000 && state?.leaseRunId === runId && state.leaseExpiresAt && new Date(state.leaseExpiresAt) > deps.now()) {
          await bounded(deps.store.fail(owner, runId, code, cleanup.signal), cleanup.signal);
        }
      } catch { /* Preserve prior state if ownership cannot be established. */ }
      finally { clearTimeout(cleanupTimer); }
    }
    return { success: false, code };
  } finally { clearTimeout(timer); }
}

export async function analyzeRecurringForOwner(ownerUserId: string, provider: RecurringBankProvider = "qonto"): Promise<AnalysisResult> {
  // Lazy server composition keeps tests of the orchestration independent of env.
  try {
    const { productionAnalysisDependencies } = await import("./server");
    return await analyzeRecurring(ownerUserId, productionAnalysisDependencies(provider));
  } catch { return { success: false, code: "DATABASE_ERROR" }; }
}

export type { AnalysisResult } from "./schema";
