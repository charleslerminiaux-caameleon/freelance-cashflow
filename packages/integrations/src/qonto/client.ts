import { z } from "zod";

import type { BankingPage, BankingProvider, TransactionWindow } from "../banking";
import { IntegrationError } from "../errors";
import { normalizeAccount, normalizeTransaction } from "./normalize";
import {
  qontoAccountsEnvelopeSchema,
  qontoTransactionsEnvelopeSchema,
} from "./schemas";

const QONTO_ORIGIN = "https://thirdparty.qonto.com";
const PAGE_SIZE = 100;
const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 10_000;
const MAX_RETRY_AFTER_MS = 5_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const TRANSACTION_STATUSES = ["pending", "completed", "declined", "reversed"] as const;

const credentialSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !/[\r\n]/u.test(value));
const loginSchema = credentialSchema.refine((value) => !value.includes(":"));
const pageSchema = z.number().int().safe().positive();
const instantSchema = z.iso.datetime({ offset: true });
const windowSchema = z
  .object({
    accountExternalId: z.string().trim().min(1).max(200),
    page: pageSchema,
    updatedFrom: instantSchema,
    updatedTo: instantSchema,
    initialCreatedFrom: instantSchema.nullable(),
    timezone: z.string().trim().min(1).max(100),
  })
  .refine((window) => Date.parse(window.updatedFrom) <= Date.parse(window.updatedTo));

type Fetch = typeof globalThis.fetch;
type Sleep = (milliseconds: number) => Promise<void>;

export type CreateQontoProviderOptions = {
  login: string;
  secretKey: string;
  fetch?: Fetch;
  sleep?: Sleep;
  now?: () => number;
};

class InvalidPayloadError extends Error {}

function invalidResponse(): IntegrationError {
  return new IntegrationError("PROVIDER_INVALID_RESPONSE");
}

function unavailable(): IntegrationError {
  return new IntegrationError("PROVIDER_UNAVAILABLE");
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function cancelBody(body: ReadableStream<Uint8Array> | ReadableStreamDefaultReader<Uint8Array>): void {
  // Abort owns the transport deadline. A broken cancellation must neither delay
  // the next attempt nor replace its primary result with a cleanup failure.
  try {
    void body.cancel().catch(() => undefined);
  } catch {
    // Cancellation is best effort; the attempt also aborts its request signal.
  }
}

async function readJsonBounded(response: Response, signal: AbortSignal): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_BODY_BYTES) {
      throw new InvalidPayloadError();
    }
  }

  if (response.body === null) throw new InvalidPayloadError();
  const reader = response.body.getReader();
  const cancelReader = () => cancelBody(reader);
  signal.addEventListener("abort", cancelReader, { once: true });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let receivedBytes = 0;
  let text = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > MAX_BODY_BYTES) throw new InvalidPayloadError();
      try {
        text += decoder.decode(chunk.value, { stream: true });
      } catch {
        throw new InvalidPayloadError();
      }
    }
    try {
      text += decoder.decode();
      return JSON.parse(text) as unknown;
    } catch {
      throw new InvalidPayloadError();
    }
  } finally {
    signal.removeEventListener("abort", cancelReader);
    cancelReader();
    reader.releaseLock();
  }
}

async function fetchAttempt(
  fetchImplementation: Fetch,
  url: URL,
  authorization: string,
): Promise<{ response: Response; body?: unknown }> {
  const controller = new AbortController();
  let response: Response | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(unavailable());
    }, ATTEMPT_TIMEOUT_MS);
  });
  const request = (async () => {
    response = await fetchImplementation(url, {
      method: "GET",
      headers: { Authorization: authorization },
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    // An injected or slow transport may settle even after the deadline won.
    if (controller.signal.aborted) {
      if (response.body) cancelBody(response.body);
      throw unavailable();
    }
    if (!response.ok) return { response };
    return { response, body: await readJsonBounded(response, controller.signal) };
  })();

  try {
    return await Promise.race([request, deadline]);
  } finally {
    controller.abort();
    if (response?.body && !response.body.locked) cancelBody(response.body);
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function retryAfterMilliseconds(header: string | null, now: () => number): number | null {
  if (header === null) return null;
  if (/^\d+$/u.test(header.trim())) return Number(header.trim()) * 1_000;
  const date = Date.parse(header);
  if (!Number.isFinite(date)) return null;
  return Math.max(0, date - now());
}

function retryCode(status: number): "PROVIDER_RATE_LIMIT" | "PROVIDER_UNAVAILABLE" {
  return status === 429 ? "PROVIDER_RATE_LIMIT" : "PROVIDER_UNAVAILABLE";
}

function validateNextPage(
  metadata: {
    current_page: number;
    next_page: number | null;
    total_pages: number;
    total_count: number;
  },
  requestedPage: number,
  itemCount: number,
): number | null {
  const nextPage = metadata.next_page;
  if (metadata.current_page !== requestedPage) {
    throw invalidResponse();
  }

  if (metadata.total_pages === 0) {
    if (
      requestedPage !== 1 ||
      nextPage !== null ||
      metadata.total_count !== 0 ||
      itemCount !== 0
    ) {
      throw invalidResponse();
    }
    return null;
  }

  const expectedNextPage =
    requestedPage < metadata.total_pages ? requestedPage + 1 : null;
  if (requestedPage > metadata.total_pages || nextPage !== expectedNextPage) {
    throw invalidResponse();
  }
  return nextPage;
}

function parsePage(page: number): number {
  const parsed = pageSchema.safeParse(page);
  if (!parsed.success) throw invalidResponse();
  return parsed.data;
}

function parseWindow(window: TransactionWindow): z.infer<typeof windowSchema> {
  const parsed = windowSchema.safeParse(window);
  if (!parsed.success) throw invalidResponse();
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: parsed.data.timezone });
  } catch {
    throw invalidResponse();
  }
  return parsed.data;
}

export function createQontoProvider(options: CreateQontoProviderOptions): BankingProvider {
  const login = loginSchema.safeParse(options.login);
  const secretKey = credentialSchema.safeParse(options.secretKey);
  if (!login.success || !secretKey.success) throw invalidResponse();

  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const authorization = `${login.data}:${secretKey.data}`;

  async function get(url: URL): Promise<unknown> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      let result: Awaited<ReturnType<typeof fetchAttempt>>;
      try {
        result = await fetchAttempt(fetchImplementation, url, authorization);
      } catch (error) {
        if (error instanceof InvalidPayloadError) throw invalidResponse();
        if (attempt === MAX_ATTEMPTS - 1) throw unavailable();
        await sleep(500 * 2 ** attempt);
        continue;
      }

      const { response } = result;
      if (response.status === 401 || response.status === 403) {
        throw new IntegrationError("PROVIDER_AUTH_EXPIRED");
      }
      if (RETRYABLE_STATUSES.has(response.status)) {
        const code = retryCode(response.status);
        if (attempt === MAX_ATTEMPTS - 1) throw new IntegrationError(code);
        const retryAfter = retryAfterMilliseconds(response.headers.get("retry-after"), now);
        if (retryAfter !== null && retryAfter > MAX_RETRY_AFTER_MS) {
          throw new IntegrationError(code);
        }
        await sleep(retryAfter ?? 500 * 2 ** attempt);
        continue;
      }
      if (!response.ok || result.body === undefined) throw invalidResponse();
      return result.body;
    }
    throw unavailable();
  }

  return {
    async listAccounts(page): Promise<BankingPage<ReturnType<typeof normalizeAccount>>> {
      const requestedPage = parsePage(page);
      const url = new URL("/v2/bank_accounts", QONTO_ORIGIN);
      url.searchParams.set("page", String(requestedPage));
      url.searchParams.set("per_page", String(PAGE_SIZE));
      const parsed = qontoAccountsEnvelopeSchema.safeParse(await get(url));
      if (!parsed.success) throw invalidResponse();
      const nextPage = parsed.data.meta
        ? validateNextPage(
            parsed.data.meta,
            requestedPage,
            parsed.data.bank_accounts.length,
          )
        : parsed.data.bank_accounts.length === PAGE_SIZE
          ? requestedPage + 1
          : null;
      return {
        items: parsed.data.bank_accounts.map((account) => normalizeAccount(account)),
        nextPage,
      };
    },

    async listTransactions(
      window,
    ): Promise<BankingPage<ReturnType<typeof normalizeTransaction>>> {
      const parsedWindow = parseWindow(window);
      const url = new URL("/v2/transactions", QONTO_ORIGIN);
      url.searchParams.set("bank_account_id", parsedWindow.accountExternalId);
      url.searchParams.set("page", String(parsedWindow.page));
      url.searchParams.set("per_page", String(PAGE_SIZE));
      for (const status of TRANSACTION_STATUSES) url.searchParams.append("status[]", status);
      url.searchParams.set("updated_at_from", parsedWindow.updatedFrom);
      url.searchParams.set("updated_at_to", parsedWindow.updatedTo);
      if (parsedWindow.initialCreatedFrom !== null) {
        url.searchParams.set("created_at_from", parsedWindow.initialCreatedFrom);
      }
      url.searchParams.set("sort_by", "updated_at:asc");

      const parsed = qontoTransactionsEnvelopeSchema.safeParse(await get(url));
      if (!parsed.success) throw invalidResponse();
      return {
        items: parsed.data.transactions.map((transaction) =>
          normalizeTransaction(
            transaction,
            parsedWindow.accountExternalId,
            parsedWindow.timezone,
          ),
        ),
        nextPage: validateNextPage(
          parsed.data.meta,
          parsedWindow.page,
          parsed.data.transactions.length,
        ),
      };
    },
  };
}
