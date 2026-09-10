import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireOwner: vi.fn(), isQontoConfigured: vi.fn(), synchronizeQontoForOwner: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("./qonto-config", () => ({ isQontoConfigured: mocks.isQontoConfigured }));
vi.mock("./sync-qonto", () => ({ synchronizeQontoForOwner: mocks.synchronizeQontoForOwner }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
import { syncQontoAction } from "./actions";
const initial = { success: false, message: null };
beforeEach(() => { vi.clearAllMocks(); mocks.requireOwner.mockResolvedValue({ userId: "owner-session" }); mocks.isQontoConfigured.mockReturnValue(true); mocks.synchronizeQontoForOwner.mockResolvedValue({ success: true, created: 2, updated: 1 }); });
it("rejects nonowner before any provider/config access", async () => {
 mocks.requireOwner.mockRejectedValue(new Error("redirect"));
 await expect(syncQontoAction(initial, new FormData())).rejects.toThrow("redirect");
 expect(mocks.isQontoConfigured).not.toHaveBeenCalled(); expect(mocks.synchronizeQontoForOwner).not.toHaveBeenCalled();
});
it("derives owner only from session and refreshes all banking consumers", async () => {
 const form = new FormData(); form.set("owner_user_id", "forged");
 expect((await syncQontoAction(initial, form)).success).toBe(true);
 expect(mocks.synchronizeQontoForOwner).toHaveBeenCalledWith("owner-session");
 for (const path of ["/integrations", "/cashflow", "/dashboard"]) expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
 expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
});
it("does not synchronize when unconfigured", async () => { mocks.isQontoConfigured.mockReturnValue(false); expect((await syncQontoAction(initial, new FormData())).message).toMatch(/configur/i); expect(mocks.synchronizeQontoForOwner).not.toHaveBeenCalled(); });
it.each(["PROVIDER_AUTH_EXPIRED", "PROVIDER_RATE_LIMIT", "PROVIDER_UNAVAILABLE", "PROVIDER_INVALID_RESPONSE", "SYNC_LOCKED", "DATABASE_ERROR"])("renders fixed actionable %s failure", async (code) => {
 mocks.synchronizeQontoForOwner.mockResolvedValue({ success: false, code, raw: "secret-payload" });
 const result = await syncQontoAction(initial, new FormData()); expect(result.success).toBe(false); expect(result.message).toBeTruthy(); expect(JSON.stringify(result)).not.toContain("secret-payload"); expect(mocks.revalidatePath).toHaveBeenCalledWith("/integrations");
});
it("contains unexpected exceptions", async () => { mocks.synchronizeQontoForOwner.mockRejectedValue(new Error("secret-payload")); expect(JSON.stringify(await syncQontoAction(initial, new FormData()))).not.toContain("secret-payload"); });
