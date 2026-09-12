import { describe, expect, it } from "vitest";
import { qontoFreshness } from "./qonto-freshness";

describe("Qonto publication freshness", () => {
  const nowMs = Date.parse("2026-09-13T12:00:00Z");
  it.each([
    ["2026-09-12T12:00:00.001Z", false, "fresh"],
    ["2026-09-12T12:00:00Z", false, "stale"],
    ["2026-09-12T11:59:59Z", false, "stale"],
    ["2026-09-13T12:00:00Z", false, "fresh"],
    ["2026-09-13T12:00:01Z", false, "stale"],
    ["invalid", false, "stale"],
    [null, false, "unconfigured"],
    ["2026-09-13T11:00:00Z", true, "error"],
    [null, true, "error"],
  ])("classifies publication %s with failure %s as %s", (lastSuccessAt, lastAttemptFailed, expected) => {
    expect(qontoFreshness({lastSuccessAt, lastAttemptFailed, nowMs})).toBe(expected);
  });
});
