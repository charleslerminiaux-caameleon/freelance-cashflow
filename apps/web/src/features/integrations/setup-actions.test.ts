// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), accounts: vi.fn(), invoices: vi.fn(), sync: vi.fn(), qonto: vi.fn(), bunq: vi.fn(), exchange: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.owner }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@fc/integrations/server", () => ({
  createQontoProvider: () => ({ listAccounts: mocks.accounts }),
  createBunqProvider: mocks.bunq,
  createRevolutProvider: () => ({ listAccounts: mocks.accounts }),
  createPennylaneProvider: () => ({ readInvoices: mocks.invoices }),
}));
vi.mock("./direct-sync", () => ({ synchronizeDirectForOwner: mocks.sync }));
vi.mock("./sync-qonto", () => ({ synchronizeQontoForOwner: mocks.qonto }));
vi.mock("./revolut-onboarding", () => ({ exchangeRevolutCode: mocks.exchange }));
import { configureIntegrationAction, disconnectIntegrationAction } from "./setup-actions";
import { createCredentialStore } from "./credential-store";
let directory: string;
const empty = { success: false, message: null };
const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; };
beforeEach(() => {
  vi.resetAllMocks(); directory = mkdtempSync(join(tmpdir(), "fc-setup-")); vi.stubEnv("INTEGRATION_CREDENTIALS_DIR", directory);
  mocks.bunq.mockImplementation(() => ({ listAccounts: mocks.accounts }));
  mocks.owner.mockResolvedValue({ userId: "owner" }); mocks.accounts.mockResolvedValue({ items: [], nextPage: null });
  mocks.invoices.mockResolvedValue({ invoices: [] }); mocks.sync.mockResolvedValue({ success: true, created: 2, updated: 0 });
  mocks.qonto.mockResolvedValue({ success: true, created: 1, updated: 0, analysisResult: { success: true, count: 0 } });
});
afterEach(() => { rmSync(directory, { recursive: true, force: true }); vi.unstubAllEnvs(); });
it("connects and synchronizes valid Qonto credentials without returning them to the browser", async () => {
  const result = await configureIntegrationAction("qonto", empty, form({ login: "login", secretKey: "private-canary" }));
  expect(result).toMatchObject({ success: true }); expect(result.message).toContain("synchronisation");
  expect(createCredentialStore().read("qonto")).toEqual({ login: "login", secretKey: "private-canary" });
  expect(JSON.stringify(result)).not.toContain("private-canary");
});
it("keeps existing credentials if the candidate is rejected by the bank", async () => {
  createCredentialStore().write("qonto", { login: "old", secretKey: "old-secret" });
  mocks.accounts.mockRejectedValue(new Error("remote private-canary"));
  const result = await configureIntegrationAction("qonto", empty, form({ login: "new", secretKey: "private-canary" }));
  expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toContain("private-canary");
  expect(createCredentialStore().read("qonto")).toEqual({ login: "old", secretKey: "old-secret" });
});
it("rejects missing fields and unknown providers before saving anything", async () => {
  expect((await configureIntegrationAction("qonto", empty, form({ login: "only" }))).success).toBe(false);
  expect((await configureIntegrationAction("tiime" as "qonto", empty, form({}))).success).toBe(false);
  expect(createCredentialStore().read("qonto")).toBeUndefined();
});
it("requires owner authorization before saving or disconnecting", async () => {
  mocks.owner.mockRejectedValue(new Error("Unauthorized"));
  await expect(configureIntegrationAction("bunq", empty, form({ apiKey: "secret" }))).rejects.toThrow("Unauthorized");
  await expect(disconnectIntegrationAction("bunq", empty, form({}))).rejects.toThrow("Unauthorized");
  expect(createCredentialStore().read("bunq")).toBeUndefined();
});
it("reports a failed first synchronization separately from saved credentials", async () => {
  mocks.sync.mockResolvedValue({ success: false, code: "DATABASE_ERROR" });
  const result = await configureIntegrationAction("pennylane", empty, form({ token: "secret" }));
  expect(result.success).toBe(false); expect(result.message).toContain("enregistrée");
  expect(createCredentialStore().read("pennylane")).toEqual({ token: "secret" });
});
it("disconnects without erasing imported data or reactivating environment configuration", async () => {
  createCredentialStore().write("bunq", { apiKey: "secret" });
  expect((await disconnectIntegrationAction("bunq", empty, form({}))).success).toBe(true);
  expect(createCredentialStore().read("bunq")).toBeNull();
});

it("keeps the same bunq device context for validation, first sync and reconfiguration", async () => {
  const { loadDirectConfig } = await import("./direct-config");
  const registered = new Set<string>();
  let registrations = 0;
  mocks.bunq.mockImplementation((config: { contextPath?: string | null }) => ({ listAccounts: async () => {
    if (!config.contextPath || !registered.has(config.contextPath)) registrations++;
    if (config.contextPath) registered.add(config.contextPath);
    return { items: [], nextPage: null };
  } }));
  mocks.sync.mockImplementation(async () => {
    await mocks.bunq(loadDirectConfig("bunq")).listAccounts();
    return { success: true, created: 0, updated: 0 };
  });
  expect((await configureIntegrationAction("bunq", empty, form({ apiKey: "secret" }))).success).toBe(true);
  expect((await configureIntegrationAction("bunq", empty, form({ apiKey: "secret" }))).success).toBe(true);
  expect(registrations).toBe(1);
});

it("recovers an existing bunq registration after disconnecting environment credentials", async () => {
  const contextPath = join(directory, "legacy-context.json");
  writeFileSync(contextPath, JSON.stringify({ fingerprint: createHash("sha256").update("legacy-key").digest("hex") }));
  vi.stubEnv("BUNQ_API_KEY", "legacy-key"); vi.stubEnv("BUNQ_CONTEXT_PATH", contextPath);
  await disconnectIntegrationAction("bunq", empty, form({}));
  expect((await configureIntegrationAction("bunq", empty, form({ apiKey: "legacy-key" }))).success).toBe(true);
  const { loadDirectConfig } = await import("./direct-config");
  expect(loadDirectConfig("bunq")?.contextPath).toBe(contextPath);
});
