import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createBankingSyncStore: vi.fn(),
  createQontoProvider: vi.fn(),
  getOwnerSettings: vi.fn(),
  loadQontoConfig: vi.fn(),
  logSyncEvent: vi.fn(),
  synchronizeBanking: vi.fn(),
  analyzeRecurringForOwner: vi.fn(),
}));

vi.mock("@/features/recurring-detection/service", () => ({ analyzeRecurringForOwner: mocks.analyzeRecurringForOwner }));

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

    mocks.analyzeRecurringForOwner.mockResolvedValue({ success: true, count: 2 });

    await expect(synchronizeQontoForOwner(ownerUserId)).resolves.toEqual({
      success: true,
      created: 2,
      updated: 3,
      analysisResult: { success: true, count: 2 },
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

it.each(["returned", "thrown"])("retains banking success and reports when analysis failure is %s", async (kind) => {
  mocks.loadQontoConfig.mockReturnValue({ login: "synthetic", secretKey: "synthetic" });
  mocks.getOwnerSettings.mockResolvedValue({ timezone: "Europe/Paris" });
  mocks.synchronizeBanking.mockResolvedValue({ success: true, created: 1, updated: 0 });
  let analyzedOwner: string | undefined;
  mocks.analyzeRecurringForOwner.mockImplementation(async (owner: string) => { analyzedOwner = owner; if (kind === "thrown") throw new Error("private"); return { success: false, code: "DATABASE_ERROR" }; });
  expect(await synchronizeQontoForOwner(ownerUserId)).toEqual({
    success: true,
    created: 1,
    updated: 0,
    analysisResult: { success: false, code: "DATABASE_ERROR" },
  });
  expect(analyzedOwner).toBe(ownerUserId);
});
it("never launches analysis after failed banking publication", async () => {
  mocks.loadQontoConfig.mockReturnValue({ login: "synthetic", secretKey: "synthetic" });
  mocks.getOwnerSettings.mockResolvedValue({ timezone: "Europe/Paris" });
  mocks.synchronizeBanking.mockResolvedValue({ success: false, code: "PROVIDER_UNAVAILABLE" });
  let ran = false; mocks.analyzeRecurringForOwner.mockImplementation(async () => { ran = true; });
  expect(await synchronizeQontoForOwner(ownerUserId)).toEqual({ success: false, code: "PROVIDER_UNAVAILABLE" });
  expect(ran).toBe(false);
});


afterEach(() => vi.useRealTimers());

it.each(["acknowledged", "uncertain"])("runs analysis only after %s publication with the real banking deadline", async (kind) => {
  vi.useFakeTimers();
  const actual = await vi.importActual<typeof import("@fc/integrations/server")>("@fc/integrations/server");
  mocks.synchronizeBanking.mockImplementation(actual.synchronizeBanking);
  mocks.loadQontoConfig.mockReturnValue({ login: "synthetic", secretKey: "synthetic" });
  mocks.getOwnerSettings.mockResolvedValue({ timezone: "Europe/Paris" });
  mocks.createQontoProvider.mockReturnValue({ listAccounts: async () => ({ items: [], nextPage: null }) });
  let release!: (receipt: { created: number; updated: number }) => void;
  const publication = new Promise(resolve => { release = resolve; });
  const fail = vi.fn();
  mocks.createBankingSyncStore.mockReturnValue({
    acquire: async () => ({}), renew: async () => {}, stageAccounts: async () => {},
    publish: () => publication, fail,
  });
  mocks.analyzeRecurringForOwner.mockResolvedValue({ success: true, count: 2 });
  let settled: unknown;
  const result = synchronizeQontoForOwner(ownerUserId).then(value => { settled = value; });
  await vi.advanceTimersByTimeAsync(119_999);
  expect(mocks.analyzeRecurringForOwner).not.toHaveBeenCalled();
  if (kind === "acknowledged") release({ created: 4, updated: 5 });
  await vi.advanceTimersByTimeAsync(1);
  expect(settled).toEqual(kind === "acknowledged"
    ? { success: true, created: 4, updated: 5, analysisResult: { success: true, count: 2 } }
    : { success: false, code: "DATABASE_ERROR" });
  release({ created: 4, updated: 5 });
  await vi.advanceTimersByTimeAsync(0);
  await result;
  expect(mocks.analyzeRecurringForOwner).toHaveBeenCalledTimes(kind === "acknowledged" ? 1 : 0);
  expect(fail).not.toHaveBeenCalled();
});


it("does not acquire an unconfigured automatic integration", async () => {
  mocks.loadQontoConfig.mockReturnValue(null);
  expect(await synchronizeQontoForOwner(ownerUserId, { mode: "automatic" })).toEqual({ success: true, skipped: true });
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
});
it("passes automatic admission skip without launching analysis", async () => {
  mocks.loadQontoConfig.mockReturnValue({ login: "synthetic", secretKey: "synthetic" });
  mocks.getOwnerSettings.mockResolvedValue({ timezone: "Europe/Paris" });
  mocks.synchronizeBanking.mockResolvedValue({ success: true, skipped: true });
  expect(await synchronizeQontoForOwner(ownerUserId, { mode: "automatic" })).toEqual({ success: true, skipped: true });
  expect(mocks.createBankingSyncStore).toHaveBeenCalledWith(expect.anything(), { mode: "automatic" });
  expect(mocks.analyzeRecurringForOwner).not.toHaveBeenCalled();
});
