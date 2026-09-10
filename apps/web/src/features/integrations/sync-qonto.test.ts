import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createBankingSyncStore: vi.fn(),
  createQontoProvider: vi.fn(),
  getOwnerSettings: vi.fn(),
  loadQontoConfig: vi.fn(),
  logSyncEvent: vi.fn(),
  synchronizeBanking: vi.fn(),
}));

vi.mock("@fc/integrations/server", () => ({
  createQontoProvider: mocks.createQontoProvider,
  logSyncEvent: mocks.logSyncEvent,
  synchronizeBanking: mocks.synchronizeBanking,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/features/settings/repository", () => ({
  getOwnerSettings: mocks.getOwnerSettings,
}));
vi.mock("./qonto-config", () => ({ loadQontoConfig: mocks.loadQontoConfig }));
vi.mock("./sync-repository", () => ({
  createBankingSyncStore: mocks.createBankingSyncStore,
}));

import { synchronizeQontoForOwner } from "./sync-qonto";

const ownerUserId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("synchronizeQontoForOwner", () => {
  it("returns a stable unconfigured result before creating privileged dependencies", async () => {
    mocks.loadQontoConfig.mockReturnValue(null);

    await expect(synchronizeQontoForOwner(ownerUserId)).resolves.toEqual({
      success: false,
      code: "PROVIDER_AUTH_EXPIRED",
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.createQontoProvider).not.toHaveBeenCalled();
  });

  it("composes the fixed production provider, owner timezone, store, run UUID, and safe logger", async () => {
    const client = { kind: "admin-client" };
    const store = { kind: "banking-store" };
    const provider = { kind: "qonto-provider" };
    mocks.loadQontoConfig.mockReturnValue({
      login: "login-fictif",
      secretKey: "secret-fictif",
    });
    mocks.createAdminClient.mockReturnValue(client);
    mocks.createBankingSyncStore.mockReturnValue(store);
    mocks.createQontoProvider.mockReturnValue(provider);
    mocks.getOwnerSettings.mockResolvedValue({ timezone: "Europe/Paris" });
    mocks.synchronizeBanking.mockResolvedValue({ success: true, created: 2, updated: 3 });

    await expect(synchronizeQontoForOwner(ownerUserId)).resolves.toEqual({
      success: true,
      created: 2,
      updated: 3,
    });

    expect(mocks.createQontoProvider).toHaveBeenCalledWith({
      login: "login-fictif",
      secretKey: "secret-fictif",
    });
    expect(mocks.getOwnerSettings).toHaveBeenCalledWith(client, ownerUserId);
    expect(mocks.createBankingSyncStore).toHaveBeenCalledWith(client);
    expect(mocks.synchronizeBanking).toHaveBeenCalledWith({
      ownerUserId,
      runId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      ),
      timezone: "Europe/Paris",
      provider,
      store,
      log: mocks.logSyncEvent,
    });
  });

  it("maps composition failures to a stable database result", async () => {
    mocks.loadQontoConfig.mockReturnValue({
      login: "login-fictif",
      secretKey: "secret-fictif",
    });
    mocks.createAdminClient.mockReturnValue({ kind: "admin-client" });
    mocks.getOwnerSettings.mockRejectedValue(new Error("fictitious-private-canary"));

    await expect(synchronizeQontoForOwner(ownerUserId)).resolves.toEqual({
      success: false,
      code: "DATABASE_ERROR",
    });
  });
});
