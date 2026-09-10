import { z } from "zod";

import type { SyncLogEvent } from "./contracts";

const runIdSchema = z.string().uuid();
const durationSchema = z.number().finite().nonnegative();
const countSchema = z.number().finite().int().safe().nonnegative();
const codeSchema = z.enum([
  "PROVIDER_AUTH_EXPIRED",
  "PROVIDER_RATE_LIMIT",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_INVALID_RESPONSE",
  "SYNC_LOCKED",
  "DATABASE_ERROR",
]);

const syncLogEventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("sync_started"), runId: runIdSchema }).strict(),
  z
    .object({ event: z.literal("page_staged"), runId: runIdSchema, count: countSchema })
    .strict(),
  z
    .object({
      event: z.literal("sync_succeeded"),
      runId: runIdSchema,
      durationMs: durationSchema,
      count: countSchema,
    })
    .strict(),
  z
    .object({
      event: z.literal("sync_failed"),
      runId: runIdSchema,
      durationMs: durationSchema,
      code: codeSchema,
    })
    .strict(),
]);

export function createSyncLogger(
  sink: (event: SyncLogEvent) => void,
): (event: unknown) => void {
  return (event) => {
    const parsed = syncLogEventSchema.safeParse(event);
    if (!parsed.success) return;
    try {
      sink(parsed.data);
    } catch {
      // Logging failures are contained so they cannot change synchronization state.
    }
  };
}

export const logSyncEvent = createSyncLogger((event) => {
  console.info(JSON.stringify(event));
});
