import { describe, expect, it } from "vitest";

import { formatMoney, moneyCents, parseAmountToCents } from "./money";

describe("money", () => {
  it("parses French formatted amounts into integer cents", () => {
    expect(parseAmountToCents("1 234,56")).toBe(123456);
  });

  it("parses negative amounts with a dot decimal separator", () => {
    expect(parseAmountToCents("-19.90")).toBe(-1990);
  });

  it("canonicalizes negative zero", () => {
    expect(Object.is(parseAmountToCents("-0"), -0)).toBe(false);
    expect(parseAmountToCents("-0")).toBe(0);
  });

  it("rejects non-integer cents", () => {
    expect(() => moneyCents(10.5)).toThrow("integer cents");
  });

  it("rejects amounts with more than two decimal places", () => {
    expect(() => parseAmountToCents("10.123")).toThrow("at most two decimals");
  });

  it("formats cents as euros for the French locale", () => {
    expect(formatMoney(moneyCents(123456))).toBe("1 234,56 €");
  });

  it("formats the largest safe cent amount without losing a cent", () => {
    expect(formatMoney(moneyCents(Number.MAX_SAFE_INTEGER))).toBe("90 071 992 547 409,91 €");
  });
});
