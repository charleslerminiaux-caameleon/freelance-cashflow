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

it("accepts only the three dashboard horizons", () => {
  for (const horizon of ["30", "90", "180"] as const) {
    expect(settingsFormSchema.parse({ ...validSettings, defaultForecastHorizonDays: horizon }))
      .toMatchObject({ defaultForecastHorizonDays: Number(horizon) });
  }

  for (const horizon of ["1", "366"]) {
    expect(() =>
      settingsFormSchema.parse({ ...validSettings, defaultForecastHorizonDays: horizon }),
    ).toThrow();
  }
});

it("rejects unknown IANA timezones", () => {
  expect(() => settingsFormSchema.parse({ ...validSettings, timezone: "Paris" })).toThrow(
    "Saisissez un fuseau horaire IANA valide.",
  );
});
