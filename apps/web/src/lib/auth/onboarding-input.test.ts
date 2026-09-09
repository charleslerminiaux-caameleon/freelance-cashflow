import { describe, expect, it } from "vitest";

import { parseOnboardingInput } from "./onboarding-input";

const validInput = {
  currency: "EUR",
  timezone: "Europe/Paris",
  country: "FR",
  legalForm: "EI",
  openingBalance: "4 238,50",
  safetyThreshold: "2 000,00",
};

describe("parseOnboardingInput", () => {
  it("normalizes validated form values to integer cents", () => {
    expect(parseOnboardingInput(validInput)).toEqual({
      currency: "EUR",
      timezone: "Europe/Paris",
      country: "FR",
      legalForm: "EI",
      openingBalanceCents: 423_850,
      safetyThresholdCents: 200_000,
    });
  });

  it("normalizes an omitted legal form to null for PostgreSQL", () => {
    expect(parseOnboardingInput({ ...validInput, legalForm: undefined }).legalForm).toBeNull();
  });

  it("rejects a negative safety threshold", () => {
    expect(() =>
      parseOnboardingInput({ ...validInput, safetyThreshold: "-0,01" }),
    ).toThrow("seuil de sécurité");
  });

  it("rejects amounts that cannot be represented as safe integer cents", () => {
    expect(() =>
      parseOnboardingInput({ ...validInput, openingBalance: "90071992547410,00" }),
    ).toThrow();
  });

  it("rejects unsupported installation locale values", () => {
    expect(() => parseOnboardingInput({ ...validInput, currency: "USD" })).toThrow();
    expect(() => parseOnboardingInput({ ...validInput, country: "BE" })).toThrow();
  });
});
