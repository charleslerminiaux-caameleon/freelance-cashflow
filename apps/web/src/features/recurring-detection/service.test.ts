import { localDate } from "@fc/shared";
import { afterEach, expect, it, vi } from "vitest";
import { analyzeRecurring, type AnalysisDependencies } from "./service";
import type { RecurringCandidate } from "@fc/domain";

const owner = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const publication = "2026-09-11T10:00:00.123456Z";
function fixture() {
  let lease: string | null = null;
  let published: RecurringCandidate[] = [{ label: "Previous" } as RecurringCandidate];
  let error: string | null = null;
  const deps: AnalysisDependencies = {
    runId: () => runId, now: () => new Date("2026-09-11T12:00:00Z"),
    store: {
      async acquire() { if (lease) throw new Error("DETECTION_LOCKED"); lease = runId; return { integrationId: owner, sourcePublication: publication }; },
      async settings() { return { timezone: "Europe/Paris", currency: "EUR" }; },
      async snapshot() { return { integration: { id: owner, last_success_at: publication }, accounts: [{ id: owner, currency: "EUR", status: "active", is_current: true }], fullTransactions: ["2026-07-05", "2026-08-05", "2026-09-05"].map((date, i) => ({ id: `t${i}`, bank_account_id: owner, currency: "EUR", label: "SYNTHETIC CLOUD", amount_cents: 1000, direction: "outflow", status: "completed", transaction_date: localDate(date) })) }; },
      async publish(_owner, token, marker, candidates) { if (lease !== token) throw new Error("DETECTION_LOCKED"); expect(marker).toBe(publication); published = candidates; lease = null; },
      async runState() { return { leaseRunId: lease, leaseExpiresAt: "2026-09-11T12:01:00Z" }; },
      async fail(_owner, token, code) { if (lease !== token) throw new Error("DETECTION_LOCKED"); lease = null; error = code; },
    },
  };
  return { deps, state: () => ({ lease, published, error }), replaceLease: () => { lease = "new-worker"; } };
}
afterEach(() => vi.useRealTimers());
it("publishes one coherent candidate with the unchanged microsecond marker", async () => {
  const f = fixture();
  expect(await analyzeRecurring(owner, f.deps)).toEqual({ success: true, count: 1 });
  expect(f.state().published).toMatchObject([{ label: "SYNTHETIC CLOUD", nextDate: "2026-10-05" }]);
  expect(f.state().lease).toBeNull();
});
it.each(["DETECTION_SOURCE_UNAVAILABLE", "DETECTION_LOCKED"])("returns %s without touching previous suggestions", async code => {
  const f = fixture(); f.deps.store.acquire = async () => { throw new Error(code); };
  expect(await analyzeRecurring(owner, f.deps)).toEqual({ success: false, code });
  expect(f.state()).toMatchObject({ published: [{ label: "Previous" }], error: null });
});
it("rejects a changed snapshot and closes only its lease, preserving earlier suggestions", async () => {
  const f = fixture(); const read = f.deps.store.snapshot;
  f.deps.store.snapshot = async (...args) => ({ ...await read(...args), integration: { id: owner, last_success_at: "2026-09-11T10:00:00.123457Z" } });
  expect(await analyzeRecurring(owner, f.deps)).toEqual({ success: false, code: "DETECTION_STALE" });
  expect(f.state()).toMatchObject({ published: [{ label: "Previous" }], error: "DETECTION_STALE", lease: null });
});
it("sanitizes database errors and never clears a replacement worker", async () => {
  const f = fixture(); f.deps.store.publish = async () => { f.replaceLease(); throw new Error("private SQL detail"); };
  expect(await analyzeRecurring(owner, f.deps)).toEqual({ success: false, code: "DATABASE_ERROR" });
  expect(f.state()).toMatchObject({ lease: "new-worker", error: null });
});
it("does not overwrite successful publication after an uncertain response", async () => {
  const f = fixture(); const publish = f.deps.store.publish;
  f.deps.store.publish = async (...args) => { await publish(...args); throw new Error("network lost"); };
  expect(await analyzeRecurring(owner, f.deps)).toEqual({ success: false, code: "DATABASE_ERROR" });
  expect(f.state()).toMatchObject({ lease: null, error: null, published: [{ label: "SYNTHETIC CLOUD" }] });
});
it("times out a stuck reader within 45 seconds and preserves earlier suggestions", async () => {
  vi.useFakeTimers(); const f = fixture();
  f.deps.store.snapshot = () => new Promise(() => {});
  const result = analyzeRecurring(owner, f.deps);
  await vi.advanceTimersByTimeAsync(45_000);
  expect(await result).toEqual({ success: false, code: "DATABASE_ERROR" });
  expect(f.state()).toMatchObject({ published: [{ label: "Previous" }], lease: null, error: "DATABASE_ERROR" });
});
it("rejects transaction overflow without publishing partial results", async () => {
  const f = fixture(); const read = f.deps.store.snapshot;
  f.deps.store.snapshot = async (...args) => { const snapshot = await read(...args); return { ...snapshot, fullTransactions: Array.from({ length: 100001 }, () => snapshot.fullTransactions![0]!) }; };
  expect(await analyzeRecurring(owner, f.deps)).toEqual({ success: false, code: "DATABASE_ERROR" });
  expect(f.state().published).toEqual([{ label: "Previous" }]);
});
it("rejects more than 10000 genuine candidates atomically", async () => {
  const f = fixture(); const read = f.deps.store.snapshot;
  f.deps.store.snapshot = async (...args) => { const snapshot = await read(...args); return { ...snapshot, fullTransactions: Array.from({ length: 10001 }, (_, i) => snapshot.fullTransactions!.map((row, j) => ({ ...row, id: `${i}-${j}`, label: `Synthetic series ${i}` }))).flat() }; };
  expect(await analyzeRecurring(owner, f.deps)).toEqual({ success: false, code: "DATABASE_ERROR" });
  expect(f.state().published).toEqual([{ label: "Previous" }]);
});
it("handles source changes at final publication without discarding previous suggestions", async () => {
  const f = fixture(); f.deps.store.publish = async () => { throw new Error("DETECTION_STALE"); };
  expect(await analyzeRecurring(owner, f.deps)).toEqual({ success: false, code: "DETECTION_STALE" });
  expect(f.state()).toMatchObject({ published: [{ label: "Previous" }], lease: null, error: "DETECTION_STALE" });
});
it("stops within 45 seconds even when failure-state inspection also hangs", async () => {
  vi.useFakeTimers(); const f = fixture();
  f.deps.store.snapshot = () => new Promise(() => {}); f.deps.store.runState = () => new Promise(() => {});
  const result = analyzeRecurring(owner, f.deps); await vi.advanceTimersByTimeAsync(45_000);
  expect(await result).toEqual({ success: false, code: "DATABASE_ERROR" });
  expect(f.state().published).toEqual([{ label: "Previous" }]);
});
it("does not publish after synchronous detection consumes its deadline before timers can run", async () => {
  const f = fixture(); let elapsed = 0;
  f.deps.monotonicNow = () => elapsed;
  const { detectMonthlyOutflows } = await import("@fc/domain");
  f.deps.detect = input => { const result = detectMonthlyOutflows(input); elapsed = 40_001; return result; };
  expect(await analyzeRecurring(owner, f.deps)).toEqual({ success: false, code: "DATABASE_ERROR" });
  expect(f.state()).toMatchObject({ published: [{ label: "Previous" }], lease: null, error: "DATABASE_ERROR" });
});
it("never closes an expired matching lease", async () => {
  const f = fixture(); f.deps.store.publish = async () => { throw new Error("DETECTION_LOCKED"); };
  f.deps.store.runState = async () => ({ leaseRunId: runId, leaseExpiresAt: "2026-09-11T11:59:00Z" });
  expect(await analyzeRecurring(owner, f.deps)).toEqual({ success: false, code: "DETECTION_LOCKED" });
  expect(f.state().error).toBeNull();
});
it("interrupts real detection loops on deadline and does not grant cleanup beyond the original 45 seconds", async () => {
  vi.useFakeTimers(); const f = fixture(); let elapsed = 0; let processed = 0; let cleanupAborted = false;
  f.deps.monotonicNow = () => elapsed;
  const originalRead = f.deps.store.snapshot;
  f.deps.store.snapshot = async (...args) => {
    const snapshot = await originalRead(...args);
    elapsed = 39_999;
    snapshot.fullTransactions = Array.from({ length: 1000 }, (_, i) => ({ ...snapshot.fullTransactions![0]!, id: `budget-${i}` }));
    return snapshot;
  };
  const { detectMonthlyOutflows } = await import("@fc/domain");
  f.deps.detect = (input, checkBudget) => detectMonthlyOutflows({ ...input, transactions: input.transactions.map(row => ({ ...row,
    get transactionDate() { processed++; if (processed === 10) elapsed = 42_000; return row.transactionDate; },
  })) }, checkBudget);
  f.deps.store.runState = async (_owner, _integration, signal) => {
    signal.addEventListener("abort", () => { cleanupAborted = true; });
    return new Promise(() => {});
  };
  const result = analyzeRecurring(owner, f.deps);
  await vi.advanceTimersByTimeAsync(3000);
  expect(cleanupAborted).toBe(true);
  expect(await result).toEqual({ success: false, code: "DATABASE_ERROR" });
  expect(processed).toBeLessThan(1000);
  expect(f.state()).toMatchObject({ published: [{ label: "Previous" }], lease: runId, error: null });
});
it("does not initiate cleanup after the original hard deadline is exhausted", async () => {
  const f = fixture(); let elapsed = 0; let inspected = false;
  f.deps.monotonicNow = () => elapsed;
  f.deps.detect = () => { elapsed = 45_001; throw new Error("DATABASE_ERROR"); };
  f.deps.store.runState = async () => { inspected = true; return { leaseRunId: runId, leaseExpiresAt: "2026-09-11T12:01:00Z" }; };
  expect(await analyzeRecurring(owner, f.deps)).toEqual({ success: false, code: "DATABASE_ERROR" });
  expect(inspected).toBe(false);
  expect(f.state()).toMatchObject({ published: [{ label: "Previous" }], lease: runId, error: null });
});
it("rechecks remaining cleanup time before closing the lease after a slow inspection", async () => {
  const f = fixture(); let elapsed = 0;
  f.deps.monotonicNow = () => elapsed;
  f.deps.detect = () => { elapsed = 40_000; throw new Error("DATABASE_ERROR"); };
  f.deps.store.runState = async () => { elapsed = 45_000; return { leaseRunId: runId, leaseExpiresAt: "2026-09-11T12:01:00Z" }; };
  expect(await analyzeRecurring(owner, f.deps)).toEqual({ success: false, code: "DATABASE_ERROR" });
  expect(f.state()).toMatchObject({ lease: runId, error: null });
});
