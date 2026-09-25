import { beforeEach, expect, it, vi } from "vitest";
const saved = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("./credential-store", () => ({ readSavedCredentials: saved.read }));
import { loadQontoConfig } from "./qonto-config";
import { loadDirectConfig } from "./direct-config";
beforeEach(() => { saved.read.mockReset(); vi.unstubAllEnvs(); });
it("uses saved credentials immediately without restarting the server", () => {
  saved.read.mockReturnValue({ login: "new-login", secretKey: "new-secret" });
  expect(loadQontoConfig()).toEqual({ login: "new-login", secretKey: "new-secret" });
  saved.read.mockReturnValue({ token: "new-token" });
  expect(loadDirectConfig("pennylane")).toEqual({ token: "new-token" });
});
it("disconnection and malformed saved secrets do not reactivate environment credentials", () => {
  vi.stubEnv("QONTO_LOGIN", "old-login"); vi.stubEnv("QONTO_SECRET_KEY", "old-secret");
  vi.stubEnv("PENNYLANE_API_TOKEN", "old-token");
  saved.read.mockReturnValue(null);
  expect(loadQontoConfig()).toBeNull(); expect(loadDirectConfig("pennylane")).toBeNull();
  saved.read.mockReturnValue({ token: "bad\nheader" });
  expect(loadDirectConfig("pennylane")).toBeNull();
});
it("keeps existing environment connections when no saved configuration exists", () => {
  saved.read.mockReturnValue(undefined); vi.stubEnv("PENNYLANE_API_TOKEN", "existing-token");
  expect(loadDirectConfig("pennylane")).toEqual({ token: "existing-token" });
});
