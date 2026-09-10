import { describe, expect, it, vi } from "vitest";

import { isQontoConfigured, loadQontoConfig } from "./qonto-config";

describe("Qonto server configuration", () => {
  it("reads exactly the two private values lazily", () => {
    const read = vi.fn((name: string) =>
      name === "QONTO_LOGIN" ? "login-fictif" : "secret-fictif",
    );

    expect(read).not.toHaveBeenCalled();
    expect(loadQontoConfig(read)).toEqual({
      login: "login-fictif",
      secretKey: "secret-fictif",
    });
    expect(read.mock.calls.map(([name]) => name)).toEqual([
      "QONTO_LOGIN",
      "QONTO_SECRET_KEY",
    ]);
  });

  it.each([
    [undefined, undefined],
    ["login-fictif", undefined],
    [undefined, "secret-fictif"],
    ["", "secret-fictif"],
    ["login fictif", "secret-fictif"],
    ["login-fictif", "secret\tfictif"],
    ["login-fictif", "secret\u0000fictif"],
  ])("returns unconfigured for absent, incomplete, whitespace, or control values", (login, secret) => {
    const read = (name: string) => (name === "QONTO_LOGIN" ? login : secret);

    expect(loadQontoConfig(read)).toBeNull();
    expect(isQontoConfigured(read)).toBe(false);
  });

  it("exposes only a public configuration boolean", () => {
    const canary = "fictitious-private-canary";
    const read = (name: string) => (name === "QONTO_LOGIN" ? "login-fictif" : canary);

    const result = isQontoConfigured(read);

    expect(result).toBe(true);
    expect(JSON.stringify(result)).not.toContain(canary);
  });

  it("does not stringify rejected credential values", () => {
    const stringify = vi.fn(() => "fictitious-private-canary");
    const invalid = { toString: stringify };
    const read = (name: string): unknown =>
      name === "QONTO_LOGIN" ? invalid : "secret-fictif";

    expect(loadQontoConfig(read)).toBeNull();
    expect(stringify).not.toHaveBeenCalled();
  });
});
