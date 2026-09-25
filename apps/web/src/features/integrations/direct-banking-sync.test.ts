// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ sync: vi.fn(), analyze: vi.fn(), store: vi.fn(), config: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/features/settings/repository", () => ({ getOwnerSettings: async () => ({ timezone: "Europe/Paris" }) }));
vi.mock("./sync-repository", () => ({ createBankingSyncStore: m.store }));
vi.mock("./direct-config", () => ({ loadDirectConfig: m.config }));
vi.mock("@/features/recurring-detection/service", () => ({ analyzeRecurringForOwner: m.analyze }));
vi.mock("@fc/integrations/server", async original => ({ ...await original<typeof import("@fc/integrations/server")>(), createRevolutProvider: () => ({}), createBunqProvider: () => ({}), synchronizeBanking: m.sync }));
import { synchronizeDirectForOwner } from "./direct-sync";
beforeEach(() => { vi.clearAllMocks(); m.config.mockReturnValue({}); m.sync.mockResolvedValue({ success: true, created: 1, updated: 2 }); m.analyze.mockResolvedValue({ success: true, count: 3 }); });
it.each(["revolut", "bunq"] as const)("analyses %s after every successful manual and automatic publication", async provider => {
  expect(await synchronizeDirectForOwner("owner", provider)).toMatchObject({ success: true, created: 1, analysisResult: { success: true, count: 3 } });
  expect(await synchronizeDirectForOwner("owner", provider, { mode: "automatic" })).toMatchObject({ success: true, analysisResult: { success: true } });
  expect(m.analyze.mock.calls).toEqual([["owner", provider], ["owner", provider]]);
  expect(m.store).toHaveBeenLastCalledWith({}, { provider, mode: "automatic" });
});
it.each([{ success: false, code: "DATABASE_ERROR" }, { success: true, skipped: true }])("does not analyze an unpublished synchronization", async result => {
  m.sync.mockResolvedValue(result);
  expect(await synchronizeDirectForOwner("owner", "bunq", { mode: "automatic" })).toEqual(result);
  expect(m.analyze).not.toHaveBeenCalled();
});
it("preserves successful bank import when analysis fails", async () => {
  m.analyze.mockRejectedValue(new Error("private"));
  expect(await synchronizeDirectForOwner("owner", "revolut")).toMatchObject({ success: true, created: 1, analysisResult: { success: false, code: "DATABASE_ERROR" } });
});
