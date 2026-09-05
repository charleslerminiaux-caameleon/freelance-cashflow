import { describe, expect, it } from "vitest";

import { localDate } from "./local-date";

describe("localDate", () => {
  it("rejects dates that JavaScript would roll over", () => {
    expect(() => localDate("2026-02-29")).toThrow("valid ISO date");
  });

  it("accepts a valid leap day", () => {
    expect(localDate("2028-02-29")).toBe("2028-02-29");
  });

  it("rejects non-ISO calendar strings", () => {
    expect(() => localDate("2028-2-29")).toThrow("valid ISO date");
  });
});
