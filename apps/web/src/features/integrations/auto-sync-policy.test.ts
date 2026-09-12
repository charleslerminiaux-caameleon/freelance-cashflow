import { expect, it } from "vitest";
import { canCheckAutomatically } from "./auto-sync-policy";

it.each([
  [false, false, 1_000, 0, false],
  [true, true, 1_000, 0, false],
  [true, false, 899_999, 900_000, false],
  [true, false, 900_000, 900_000, true],
  [true, false, 900_001, 900_000, true],
])("admits visible=%s inFlight=%s now=%s retryAfter=%s as %s", (visible, inFlight, now, retryAfter, expected) => {
  expect(canCheckAutomatically(visible, inFlight, now, retryAfter)).toBe(expected);
});
