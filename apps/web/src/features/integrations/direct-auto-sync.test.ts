import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ owner: vi.fn(), config: vi.fn(), sync: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: m.owner }));
vi.mock("next/cache", () => ({ revalidatePath: m.refresh }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("./qonto-config", () => ({ isQontoConfigured: vi.fn() }));
vi.mock("./sync-qonto", () => ({ synchronizeQontoForOwner: vi.fn() }));
vi.mock("./direct-config", () => ({ loadDirectConfig: m.config }));
vi.mock("./direct-sync", () => ({ synchronizeDirectForOwner: m.sync }));
import { autoSyncDirectAction } from "./auto-sync-action";
beforeEach(() => { vi.clearAllMocks(); m.owner.mockResolvedValue({ userId: "session-owner" }); m.config.mockReturnValue({}); m.sync.mockResolvedValue({ success: true, created: 1, updated: 0, analysisResult: { success: true, count: 2 } }); });
it.each(["revolut", "bunq", "pennylane"] as const)("refreshes %s with automatic server-derived owner and admission", async provider => {
  expect(await autoSyncDirectAction(provider)).toMatchObject({ status: "synced" });
  expect(m.sync).toHaveBeenCalledWith("session-owner", provider, { mode: "automatic" });
  for (const path of ["/integrations", "/dashboard", "/expenses", "/invoices"]) expect(m.refresh).toHaveBeenCalledWith(path);
});
it("rejects forged or unavailable providers without database work", async () => {
  expect(await autoSyncDirectAction("tiime" as "bunq")).toEqual({ status: "skipped" });
  m.config.mockReturnValue(null); expect(await autoSyncDirectAction("bunq")).toEqual({ status: "skipped" });
  expect(m.sync).not.toHaveBeenCalled();
});
it("keeps server admission skips neutral and errors sanitized", async () => {
  m.sync.mockResolvedValue({ success: true, skipped: true });
  expect(await autoSyncDirectAction("bunq")).toEqual({ status: "skipped" }); expect(m.refresh).not.toHaveBeenCalled();
  m.sync.mockRejectedValue(new Error("private")); expect(await autoSyncDirectAction("bunq")).toEqual({ status: "error", code: "DATABASE_ERROR" });
});
it("authenticates before any configuration or synchronization", async () => {
  m.owner.mockRejectedValue(new Error("redirect")); await expect(autoSyncDirectAction("bunq")).rejects.toThrow("redirect");
  expect(m.config).not.toHaveBeenCalled(); expect(m.sync).not.toHaveBeenCalled();
});
