import { expect, it } from "vitest";
import { canCheckAutomatically, publicationTimestamp } from "./auto-sync-policy";

it.each([
  [false, false, false],
  [false, true, false],
  [true, true, false],
  [true, false, true],
])("admits visible=%s inFlight=%s as %s", (visible, inFlight, expected) => {
  expect(canCheckAutomatically(visible, inFlight)).toBe(expected);
});

it.each([
  [undefined, null], [null, null], ["invalid", null],
  ["2026-09-12T00:00:00.001Z", null],
  ["2026-09-12T00:00:00Z", 1789171200000],
  ["2026-09-11T23:59:59.999Z", 1789171199999],
  ["1970-01-01T00:00:00Z", 0],
])("accepts only finite nonfuture publication proof %s", (proof, expected) => {
  expect(publicationTimestamp(proof, Date.parse("2026-09-12T00:00:00Z"))).toBe(expected);
});
