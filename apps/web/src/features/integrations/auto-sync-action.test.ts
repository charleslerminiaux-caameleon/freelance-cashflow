import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireOwner: vi.fn(), isQontoConfigured: vi.fn(), synchronizeQontoForOwner: vi.fn(), revalidatePath: vi.fn(), createClient: vi.fn(), getQontoIntegration: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("./qonto-config", () => ({ isQontoConfigured: mocks.isQontoConfigured }));
vi.mock("./sync-qonto", () => ({ synchronizeQontoForOwner: mocks.synchronizeQontoForOwner }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("./repository", () => ({ getQontoIntegration: mocks.getQontoIntegration }));
import { autoSyncQontoAction } from "./auto-sync-action";
beforeEach(() => { vi.clearAllMocks(); mocks.requireOwner.mockResolvedValue({ userId: "owner-session" }); mocks.isQontoConfigured.mockReturnValue(true); mocks.getQontoIntegration.mockResolvedValue(null); });
it("requires authenticated owner before configuration or acquisition", async () => {
  mocks.requireOwner.mockRejectedValue(new Error("redirect"));
  await expect(autoSyncQontoAction()).rejects.toThrow("redirect");
  expect(mocks.isQontoConfigured).not.toHaveBeenCalled();
  expect(mocks.synchronizeQontoForOwner).not.toHaveBeenCalled();
});
it("skips unconfigured providers without acquiring", async () => {
  mocks.isQontoConfigured.mockReturnValue(false);
  expect(await autoSyncQontoAction()).toEqual({ status: "skipped" });
  expect(mocks.synchronizeQontoForOwner).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
it("derives automatic mode and owner on the server and keeps skip neutral", async () => {
  mocks.synchronizeQontoForOwner.mockResolvedValue({ success: true, skipped: true });
  expect(await autoSyncQontoAction()).toEqual({ status: "skipped" });
  expect(mocks.synchronizeQontoForOwner).toHaveBeenCalledWith("owner-session", { mode: "automatic" });
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
it.each([true, false])("refreshes published views with separate analysis success=%s", async success => {
  const analysisResult = success ? { success: true, count: 2 } : { success: false, code: "DATABASE_ERROR" };
  mocks.synchronizeQontoForOwner.mockResolvedValue({ success: true, created: 1, updated: 0, analysisResult });
  expect(await autoSyncQontoAction()).toEqual({ status: "synced", analysisResult });
  for (const path of ["/integrations", "/cashflow", "/dashboard", "/expenses"]) expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
});
it("returns only stable failure detail", async () => {
  mocks.synchronizeQontoForOwner.mockResolvedValue({ success: false, code: "PROVIDER_AUTH_EXPIRED", raw: "private" });
  expect(await autoSyncQontoAction()).toEqual({ status: "error", code: "PROVIDER_AUTH_EXPIRED" });
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
  mocks.synchronizeQontoForOwner.mockRejectedValue(new Error("private"));
  expect(await autoSyncQontoAction()).toEqual({ status: "error", code: "DATABASE_ERROR" });
});

it("returns only owner-scoped publication proof on a skip", async () => {
  mocks.synchronizeQontoForOwner.mockResolvedValue({ success: true, skipped: true });
  mocks.createClient.mockResolvedValue({ kind: "owner-client" });
  mocks.getQontoIntegration.mockResolvedValue({ last_success_at: "2026-09-12T00:00:00Z", raw: "private" });
  expect(await autoSyncQontoAction()).toEqual({ status: "skipped", lastSuccessAt: "2026-09-12T00:00:00Z" });
  expect(mocks.getQontoIntegration).toHaveBeenCalledWith({ kind: "owner-client" }, "owner-session", expect.any(AbortSignal));
});

afterEach(() => vi.useRealTimers());
it("bounds optional publication proof and aborts it without converting skip to failure", async () => {
  vi.useFakeTimers();
  mocks.synchronizeQontoForOwner.mockResolvedValue({ success: true, skipped: true });
  let signal: AbortSignal | undefined;
  mocks.getQontoIntegration.mockImplementation((_client, _owner, requestSignal) => { signal = requestSignal; return new Promise(() => {}); });
  let settled: unknown;
  const request = autoSyncQontoAction().then(result => { settled = result; });
  await vi.advanceTimersByTimeAsync(4_999);
  expect(settled).toBeUndefined();
  await vi.advanceTimersByTimeAsync(1);
  await request;
  expect(settled).toEqual({ status: "skipped" });
  expect(signal?.aborted).toBe(true);
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

it.each(["2026-09-13T00:00:00Z", "invalid"])("omits unsafe publication proof %s without changing the skip result", async last_success_at => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-12T00:00:00Z"));
  mocks.synchronizeQontoForOwner.mockResolvedValue({ success: true, skipped: true });
  mocks.getQontoIntegration.mockResolvedValue({ last_success_at });
  expect(await autoSyncQontoAction()).toEqual({ status: "skipped" });
});
it("returns a newer owner publication in error metadata without claiming bank success", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-12T00:00:00Z"));
  mocks.synchronizeQontoForOwner.mockResolvedValue({ success: false, code: "PROVIDER_AUTH_EXPIRED" });
  mocks.getQontoIntegration.mockResolvedValue({ last_success_at: "2026-09-11T23:00:00Z" });
  expect(await autoSyncQontoAction()).toEqual({ status: "error", code: "PROVIDER_AUTH_EXPIRED", lastSuccessAt: "2026-09-11T23:00:00Z" });
});
