import { expect, it } from "vitest";

import { settingsFormSchema } from "./schema";

const validSettings = {
  safetyThreshold: "20 000,00",
  timezone: "Europe/Paris",
  legalForm: "SASU",
  defaultForecastHorizonDays: "90",
  defaultScenario: "committed",
};

it("parses only the owner-editable settings", () => {
  expect(settingsFormSchema.parse(validSettings)).toEqual({
    safetyCashThresholdCents: 2_000_000,
    timezone: "Europe/Paris",
    legalForm: "SASU",
    defaultForecastHorizonDays: 90,
    defaultScenario: "committed",
  });
});

it("rejects unknown IANA timezones and out-of-range horizons", () => {
  expect(() => settingsFormSchema.parse({ ...validSettings, timezone: "Paris" })).toThrow(
    "Saisissez un fuseau horaire IANA valide.",
  );
  expect(() =>
    settingsFormSchema.parse({ ...validSettings, defaultForecastHorizonDays: "367" }),
  ).toThrow();
});
