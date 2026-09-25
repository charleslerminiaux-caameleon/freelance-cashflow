import { describe, expect, it } from "vitest";
import { projectionDates } from "./chart-sampling";

describe("projection landmarks", () => {
  it("keeps weekly balances and the final day for a 30-day horizon", () => {
    expect(projectionDates("2026-09-25", "2026-10-25", 30)).toEqual([
      "2026-09-25", "2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-25",
    ]);
  });
  it("uses calendar months across year boundaries without losing endpoints", () => {
    expect(projectionDates("2026-11-25", "2027-02-23", 90)).toEqual([
      "2026-11-25", "2026-12-01", "2027-01-01", "2027-02-01", "2027-02-23",
    ]);
  });
  it("does not invent dates for an empty or single-day forecast", () => {
    expect(projectionDates(undefined, undefined, 90)).toEqual([]);
    expect(projectionDates("2026-09-25", "2026-09-25", 30)).toEqual(["2026-09-25"]);
  });
});
