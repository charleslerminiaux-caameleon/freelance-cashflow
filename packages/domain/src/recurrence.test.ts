import { localDate } from "@fc/shared";
import { describe, expect, it } from "vitest";

import { generateOccurrences } from "./recurrence";

describe("generateOccurrences", () => {
  it("clamps monthly occurrences to the final day of each month", () => {
    expect(
      generateOccurrences({
        frequency: "monthly",
        dayOfMonth: 31,
        startDate: localDate("2026-01-31"),
        endDate: localDate("2026-04-30"),
      }),
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("advances quarterly from the start month", () => {
    expect(
      generateOccurrences({
        frequency: "quarterly",
        dayOfMonth: 15,
        startDate: localDate("2026-01-15"),
        endDate: localDate("2026-10-15"),
      }),
    ).toEqual(["2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15"]);
  });

  it("skips an occurrence before a non-aligned start without shifting the cadence", () => {
    expect(
      generateOccurrences({
        frequency: "quarterly",
        dayOfMonth: 15,
        startDate: localDate("2026-01-20"),
        endDate: localDate("2026-10-15"),
      }),
    ).toEqual(["2026-04-15", "2026-07-15", "2026-10-15"]);
  });

  it("clamps yearly February occurrences across leap years", () => {
    expect(
      generateOccurrences({
        frequency: "yearly",
        dayOfMonth: 29,
        startDate: localDate("2027-02-01"),
        endDate: localDate("2029-02-28"),
      }),
    ).toEqual(["2027-02-28", "2028-02-29", "2029-02-28"]);
  });

  it("uses inclusive start and end boundaries", () => {
    expect(
      generateOccurrences({
        frequency: "monthly",
        dayOfMonth: 5,
        startDate: localDate("2026-09-05"),
        endDate: localDate("2026-09-05"),
      }),
    ).toEqual(["2026-09-05"]);
  });

  it("rejects inverted ranges", () => {
    expect(() =>
      generateOccurrences({
        frequency: "monthly",
        dayOfMonth: 5,
        startDate: localDate("2026-09-06"),
        endDate: localDate("2026-09-05"),
      }),
    ).toThrow("Recurrence end date must not be before start date");
  });

  it("rejects invalid occurrence days", () => {
    expect(() =>
      generateOccurrences({
        frequency: "monthly",
        dayOfMonth: 32,
        startDate: localDate("2026-09-01"),
        endDate: localDate("2026-09-30"),
      }),
    ).toThrow("Recurrence day must be an integer between 1 and 31");
  });
});
