import { z } from "zod";
import { IntegrationError } from "./errors";
import { withCancellation } from "./cancellation";
import type { TransactionWindow } from "./banking";
export const invalid = () => new IntegrationError("PROVIDER_INVALID_RESPONSE");
export const unavailable = () => new IntegrationError("PROVIDER_UNAVAILABLE");
export const textId = z.string().min(1).max(200);
export const currency = z.string().regex(/^[A-Z]{3}$/);
export const instant = z.iso.datetime({ offset: true });
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw invalid();
  return result.data;
}
export function credential(input: unknown): string {
  return parse(
    z
      .string()
      .min(1)
      .max(10000)
      .refine((v) => !/[\r\n]/.test(v)),
    input,
  );
}
export function pageNumber(page: number): number {
  return parse(z.number().int().min(1).max(10000), page);
}
export function validateWindow(w: TransactionWindow): void {
  pageNumber(w.page);
  parse(textId, w.accountExternalId);
  parse(instant, w.updatedFrom);
  parse(instant, w.updatedTo);
  if (w.initialCreatedFrom !== null) parse(instant, w.initialCreatedFrom);
  if (Date.parse(w.updatedFrom) > Date.parse(w.updatedTo)) throw invalid();
  try {
    new Intl.DateTimeFormat("en", { timeZone: w.timezone });
  } catch {
    throw invalid();
  }
}
export function cents(value: string | number): number {
  const str = String(value);
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(str)) throw invalid();
  const [whole, fraction = ""] = str.replace(/^-/, "").split(".");
  const n = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  const signed = str.startsWith("-") ? -n : n;
  if (
    signed > BigInt(Number.MAX_SAFE_INTEGER) ||
    signed < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw invalid();
  return Number(signed);
}
export function businessDate(value: string, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(value));
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    throw invalid();
  }
}
export function unique(ids: string[]): void {
  if (new Set(ids).size !== ids.length) throw invalid();
}
/** Fixed-origin callers own URL construction; no redirects, bounded bytes and a hard deadline including body reads. */
export async function request(
  fetcher: typeof fetch,
  url: URL,
  init: RequestInit,
  signal?: AbortSignal,
  verifyBody?: (body: string, response: Response) => void,
): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 10000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let response: Response | undefined;
  try {
    return await withCancellation(
      async () => {
        response = await fetcher(url, {
          ...init,
          redirect: "error",
          cache: "no-store",
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          if (response.body) void response.body.cancel().catch(() => undefined);
          throw unavailable();
        }
        if (response.redirected) throw invalid();
        if (response.status === 401 || response.status === 403)
          throw new IntegrationError("PROVIDER_AUTH_EXPIRED");
        if (response.status === 429)
          throw new IntegrationError("PROVIDER_RATE_LIMIT");
        if (response.status >= 500) throw unavailable();
        if (!response.ok || !response.body) throw invalid();
        if (Number(response.headers.get("content-length")) > 5 * 1024 * 1024)
          throw invalid();
        reader = response.body.getReader();
        let bytes = 0;
        let body = "";
        const decoder = new TextDecoder("utf-8", { fatal: true });
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 5 * 1024 * 1024) throw invalid();
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
        verifyBody?.(body, response);
        try {
          return JSON.parse(body) as unknown;
        } catch {
          throw invalid();
        }
      },
      controller.signal,
      unavailable,
    );
  } catch (error) {
    if (error instanceof IntegrationError) throw error;
    throw unavailable();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    controller.abort();
    if (reader) void reader.cancel().catch(() => undefined);
    else if (response?.body) void response.body.cancel().catch(() => undefined);
  }
}
