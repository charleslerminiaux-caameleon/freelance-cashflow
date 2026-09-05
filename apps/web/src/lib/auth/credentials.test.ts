import { describe, expect, it } from "vitest";

import { parseCredentials } from "./credentials";

describe("parseCredentials", () => {
  it("normalizes an email and accepts a strong enough password", () => {
    expect(
      parseCredentials({ email: "  OWNER@Example.test ", password: "mot-de-passe-solide" }),
    ).toEqual({ email: "owner@example.test", password: "mot-de-passe-solide" });
  });

  it("rejects malformed credentials", () => {
    expect(() => parseCredentials({ email: "not-an-email", password: "short" })).toThrow();
  });
});
