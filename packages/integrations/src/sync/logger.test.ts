import { describe, expect, it, vi } from "vitest";

import { createSyncLogger } from "./logger";

const runId = "11111111-1111-4111-8111-111111111111";

describe("createSyncLogger", () => {
  it("emits only the allowlisted shape for each synchronization event", () => {
    const sink = vi.fn();
    const log = createSyncLogger(sink);

    log({ event: "sync_started", runId });
    log({ event: "page_staged", runId, count: 3 });
    log({ event: "sync_succeeded", runId, durationMs: 125, count: 7 });
    log({
      event: "sync_failed",
      runId,
      durationMs: 250,
      code: "PROVIDER_UNAVAILABLE",
    });

    expect(sink.mock.calls.map(([event]) => event)).toEqual([
      { event: "sync_started", runId },
      { event: "page_staged", runId, count: 3 },
      { event: "sync_succeeded", runId, durationMs: 125, count: 7 },
      {
        event: "sync_failed",
        runId,
        durationMs: 250,
        code: "PROVIDER_UNAVAILABLE",
      },
    ]);
  });

  it.each([
    { event: "arbitrary_event", runId },
    { event: "sync_started", runId: "not-a-uuid" },
    { event: "page_staged", runId, count: -1 },
    { event: "page_staged", runId, count: Number.POSITIVE_INFINITY },
    { event: "sync_succeeded", runId, durationMs: -1, count: 0 },
    { event: "sync_failed", runId, durationMs: 1, code: "RAW_PROVIDER_FAILURE" },
  ])("rejects invalid names, identifiers, counters, durations, and codes", (event) => {
    const sink = vi.fn();

    createSyncLogger(sink)(event);

    expect(sink).not.toHaveBeenCalled();
  });

  it("rejects injected fields without serializing their values", () => {
    const output: string[] = [];
    const canary = "fictitious-private-canary";
    const log = createSyncLogger((event) => output.push(JSON.stringify(event)));

    log({
      event: "sync_failed",
      runId,
      durationMs: 4,
      code: "DATABASE_ERROR",
      headers: { authorization: canary },
      message: canary,
      amount: 123_456,
      iban: canary,
      label: canary,
      error: new Error(canary),
    });

    expect(output.join(" ")).not.toContain(canary);
    expect(output).toEqual([]);
  });

  it("contains sink failures inside the logging boundary", () => {
    const log = createSyncLogger(() => {
      throw new Error("fictitious logger outage");
    });

    expect(() => log({ event: "sync_started", runId })).not.toThrow();
  });
});
