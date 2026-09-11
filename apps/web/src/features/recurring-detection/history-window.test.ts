import { expect, it } from "vitest";
import { recurringHistoryWindow } from "./history-window";
it.each([
  ["2026-09-11", "2026-03-11"], ["2026-08-31", "2026-02-28"], ["2024-08-31", "2024-02-29"], ["2026-01-31", "2025-07-31"],
])("reads six clamped calendar months for %s", (today, since) => {
  expect(recurringHistoryWindow(today)).toEqual({ since, until: today });
});
