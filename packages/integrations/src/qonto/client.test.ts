import { afterEach, describe, expect, it, vi } from "vitest";

import { IntegrationError } from "../errors";
import { createQontoProvider } from "./client";
import { fakeAccount, fakePendingTransaction, fakeTransaction } from "./fixtures";

const credentials = { login: "login-fictif", secretKey: "secret-fictif" };

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function metadata(currentPage: number, nextPage: number | null) {
  return {
    current_page: currentPage,
    next_page: nextPage,
    prev_page: currentPage === 1 ? null : currentPage - 1,
    total_pages: nextPage === null ? currentPage : nextPage,
    total_count: nextPage === null ? 1 : 101,
    per_page: 100,
  };
}

function transactionWindow(overrides: Record<string, unknown> = {}) {
  return {
    accountExternalId: "account-fake",
    page: 1,
    updatedFrom: "2026-03-01T00:00:00.000Z",
    updatedTo: "2026-04-01T00:00:00.000Z",
    initialCreatedFrom: "2025-10-01T00:00:00.000Z",
    timezone: "Europe/Paris",
    ...overrides,
  };
}

function sequenceFetch(responses: Array<Response | Error>) {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    const response = responses.shift();
    if (response instanceof Error) throw response;
    if (response === undefined) throw new Error("Unexpected extra request");
    return response;
  });
  return { fetch, requests };
}

function expectIntegrationCode(error: unknown, code: string) {
  expect(error).toBeInstanceOf(IntegrationError);
  expect((error as IntegrationError).code).toBe(code);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createQontoProvider HTTP contract", () => {
  it("uses the fixed account endpoint, API-key header, and safe GET options", async () => {
    const transport = sequenceFetch([
      jsonResponse({ bank_accounts: [fakeAccount], meta: metadata(1, 2) }),
    ]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    await expect(provider.listAccounts(1)).resolves.toMatchObject({ nextPage: 2 });

    expect(transport.requests).toHaveLength(1);
    const request = transport.requests[0];
    const url = new URL(request?.url ?? "");
    expect(url.origin).toBe("https://thirdparty.qonto.com");
    expect(url.pathname).toBe("/v2/bank_accounts");
    expect(Object.fromEntries(url.searchParams)).toEqual({ page: "1", per_page: "100" });
    expect(request?.init?.method).toBe("GET");
    expect(new Headers(request?.init?.headers).get("Authorization")).toBe(
      "login-fictif:secret-fictif",
    );
    expect(request?.init?.redirect).toBe("error");
    expect(request?.init?.cache).toBe("no-store");
  });

  it("falls back to account page length when metadata is absent", async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) => ({
      ...fakeAccount,
      id: `account-${index}`,
    }));
    const transport = sequenceFetch([
      jsonResponse({ bank_accounts: fullPage }),
      jsonResponse({ bank_accounts: [fakeAccount] }),
    ]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    await expect(provider.listAccounts(3)).resolves.toMatchObject({ nextPage: 4 });
    await expect(provider.listAccounts(4)).resolves.toMatchObject({ nextPage: null });
  });

  it("sends the complete transaction window and uses validated next-page metadata", async () => {
    const transport = sequenceFetch([
      jsonResponse({
        transactions: [fakePendingTransaction],
        meta: metadata(1, 2),
      }),
    ]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    await expect(provider.listTransactions(transactionWindow())).resolves.toMatchObject({
      items: [{ externalId: "transaction-pending-fake", valueDate: null }],
      nextPage: 2,
    });

    const url = new URL(transport.requests[0]?.url ?? "");
    expect(url.pathname).toBe("/v2/transactions");
    expect(url.searchParams.get("bank_account_id")).toBe("account-fake");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("per_page")).toBe("100");
    expect(url.searchParams.getAll("status[]")).toEqual([
      "pending",
      "completed",
      "declined",
      "reversed",
    ]);
    expect(url.searchParams.get("updated_at_from")).toBe("2026-03-01T00:00:00.000Z");
    expect(url.searchParams.get("updated_at_to")).toBe("2026-04-01T00:00:00.000Z");
    expect(url.searchParams.get("created_at_from")).toBe("2025-10-01T00:00:00.000Z");
    expect(url.searchParams.get("sort_by")).toBe("updated_at:asc");
    expect(url.searchParams.has("iban")).toBe(false);
  });

  it("omits the initial creation filter after the first synchronization", async () => {
    const transport = sequenceFetch([
      jsonResponse({ transactions: [], meta: metadata(2, null) }),
    ]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    await expect(
      provider.listTransactions(transactionWindow({ page: 2, initialCreatedFrom: null })),
    ).resolves.toEqual({ items: [], nextPage: null });

    expect(new URL(transport.requests[0]?.url ?? "").searchParams.has("created_at_from")).toBe(
      false,
    );
  });

  it("accepts an empty first transaction page with zero total pages", async () => {
    const transport = sequenceFetch([
      jsonResponse({
        transactions: [],
        meta: {
          current_page: 1,
          next_page: null,
          prev_page: null,
          total_pages: 0,
          total_count: 0,
          per_page: 100,
        },
      }),
    ]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    await expect(provider.listTransactions(transactionWindow())).resolves.toEqual({
      items: [],
      nextPage: null,
    });
  });

  it.each([
    ["current page mismatch", 1, metadata(2, 3)],
    ["repeated next page", 1, metadata(1, 1)],
    ["backward next page", 2, metadata(2, 1)],
    [
      "forward next-page jump",
      1,
      { ...metadata(1, 2), next_page: 3, total_pages: 3 },
    ],
    [
      "premature terminal page",
      1,
      { ...metadata(1, null), next_page: null, total_pages: 2, total_count: 101 },
    ],
    [
      "current page beyond total pages",
      3,
      { ...metadata(3, null), total_pages: 2 },
    ],
  ])("rejects invalid %s metadata", async (_case, requestedPage, meta) => {
    const transport = sequenceFetch([
      jsonResponse({ transactions: [fakeTransaction], meta }),
    ]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    try {
      await provider.listTransactions(transactionWindow({ page: requestedPage }));
      throw new Error("expected invalid metadata rejection");
    } catch (error) {
      expectIntegrationCode(error, "PROVIDER_INVALID_RESPONSE");
    }
  });

  it("rejects zero-page metadata when the result is not empty", async () => {
    const transport = sequenceFetch([
      jsonResponse({
        transactions: [fakeTransaction],
        meta: {
          current_page: 1,
          next_page: null,
          prev_page: null,
          total_pages: 0,
          total_count: 1,
          per_page: 100,
        },
      }),
    ]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    await expect(provider.listTransactions(transactionWindow())).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
    });
  });

  it.each([
    ["malformed JSON", new Response("{private malformed", { status: 200 })],
    ["truncated UTF-8", new Response(new Uint8Array([0xe2, 0x82]))],
    ["missing transaction metadata", jsonResponse({ transactions: [fakeTransaction] })],
    [
      "schema failure",
      jsonResponse({
        transactions: [{ ...fakeTransaction, amount_cents: "private invalid cents" }],
        meta: metadata(1, null),
      }),
    ],
  ])("sanitizes %s without retrying", async (_case, response) => {
    const transport = sequenceFetch([response]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    try {
      await provider.listTransactions(transactionWindow());
      throw new Error("expected invalid response rejection");
    } catch (error) {
      expectIntegrationCode(error, "PROVIDER_INVALID_RESPONSE");
      expect((error as Error).message).not.toContain("private");
      expect((error as Error).cause).toBeUndefined();
    }
    expect(transport.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized response body before parsing it", async () => {
    const transport = sequenceFetch([
      new Response("private", {
        status: 200,
        headers: { "content-length": String(5 * 1024 * 1024 + 1) },
      }),
    ]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    await expect(provider.listAccounts(1)).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
    });
  });

  it("bounds an oversized valid JSON body when Content-Length is absent", async () => {
    const oversized = JSON.stringify({
      bank_accounts: [],
      padding: "x".repeat(5 * 1024 * 1024),
    });
    const transport = sequenceFetch([new Response(oversized, { status: 200 })]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    await expect(provider.listAccounts(1)).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
    });
  });

  it.each([
    [{ login: "", secretKey: "secret-fictif" }, "empty login"],
    [{ login: "login:fictif", secretKey: "secret-fictif" }, "ambiguous login"],
    [{ login: "login-fictif", secretKey: "secret\nfictif" }, "header injection"],
  ])("rejects invalid configuration: %s", (config) => {
    expect(() => createQontoProvider(config)).toThrowError(IntegrationError);
  });
});

describe("createQontoProvider retry policy", () => {
  it("recovers from transient responses with exponential waits", async () => {
    const transport = sequenceFetch([
      new Response(null, { status: 503 }),
      jsonResponse({ bank_accounts: [fakeAccount] }),
    ]);
    const waits: number[] = [];
    const provider = createQontoProvider({
      ...credentials,
      fetch: transport.fetch,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
      },
    });

    await expect(provider.listAccounts(1)).resolves.toMatchObject({ nextPage: null });
    expect(transport.fetch).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([500]);
  });

  it.each([
    [429, "PROVIDER_RATE_LIMIT"],
    [408, "PROVIDER_UNAVAILABLE"],
    [500, "PROVIDER_UNAVAILABLE"],
    [502, "PROVIDER_UNAVAILABLE"],
    [503, "PROVIDER_UNAVAILABLE"],
    [504, "PROVIDER_UNAVAILABLE"],
  ])("stops after three attempts for HTTP %i", async (status, code) => {
    const transport = sequenceFetch([
      new Response(null, { status }),
      new Response(null, { status }),
      new Response(null, { status }),
    ]);
    const waits: number[] = [];
    const provider = createQontoProvider({
      ...credentials,
      fetch: transport.fetch,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
      },
    });

    try {
      await provider.listAccounts(1);
      throw new Error("expected retry exhaustion");
    } catch (error) {
      expectIntegrationCode(error, code);
    }
    expect(transport.fetch).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([500, 1_000]);
  });

  it("retries network failures and exposes only the stable unavailable error", async () => {
    const transport = sequenceFetch([
      new Error("private host lookup detail"),
      new Error("private host lookup detail"),
      new Error("private host lookup detail"),
    ]);
    const provider = createQontoProvider({
      ...credentials,
      fetch: transport.fetch,
      sleep: async () => undefined,
    });

    try {
      await provider.listAccounts(1);
      throw new Error("expected retry exhaustion");
    } catch (error) {
      expectIntegrationCode(error, "PROVIDER_UNAVAILABLE");
      expect((error as Error).message).not.toContain("private");
      expect((error as Error).cause).toBeUndefined();
    }
  });

  it.each([401, 403])("does not retry authentication HTTP %i", async (status) => {
    const transport = sequenceFetch([new Response("private auth body", { status })]);
    const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });

    await expect(provider.listAccounts(1)).rejects.toMatchObject({
      code: "PROVIDER_AUTH_EXPIRED",
    });
    expect(transport.fetch).toHaveBeenCalledTimes(1);
  });

  it("respects delta-seconds and HTTP-date Retry-After values", async () => {
    const retryDate = "Tue, 01 Sep 2026 12:00:03 GMT";
    const transport = sequenceFetch([
      new Response(null, { status: 429, headers: { "retry-after": "2" } }),
      new Response(null, { status: 503, headers: { "retry-after": retryDate } }),
      jsonResponse({ bank_accounts: [] }),
    ]);
    const waits: number[] = [];
    const provider = createQontoProvider({
      ...credentials,
      fetch: transport.fetch,
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
      },
      now: () => Date.parse("2026-09-01T12:00:00.000Z"),
    });

    await expect(provider.listAccounts(1)).resolves.toEqual({ items: [], nextPage: null });
    expect(waits).toEqual([2_000, 3_000]);
  });

  it("does not retry before a Retry-After longer than five seconds", async () => {
    const transport = sequenceFetch([
      new Response("private rate body", { status: 429, headers: { "retry-after": "6" } }),
    ]);
    const provider = createQontoProvider({
      ...credentials,
      fetch: transport.fetch,
      sleep: async () => {
        throw new Error("must not sleep");
      },
    });

    await expect(provider.listAccounts(1)).rejects.toMatchObject({
      code: "PROVIDER_RATE_LIMIT",
    });
    expect(transport.fetch).toHaveBeenCalledTimes(1);
  });

  it("aborts every unavailable attempt after ten seconds", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("private aborted")));
      }),
    );
    const provider = createQontoProvider({
      ...credentials,
      fetch,
      sleep: async () => undefined,
    });

    const result = expect(provider.listAccounts(1)).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);

    await result;
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

function openResponse(
  init?: ResponseInit,
  chunk?: Uint8Array,
  onCancel: () => void | Promise<void> = () => undefined,
) {
  let cancellations = 0;
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      if (chunk) controller.enqueue(chunk);
    },
    cancel() {
      cancellations += 1;
      return onCancel();
    },
  }), init);
  return { response, cancellations: () => cancellations };
}

function interruptedResponse() {
  let pulls = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulls++ === 0) controller.enqueue(new TextEncoder().encode('{"bank_accounts":'));
      else controller.error(new TypeError("private connection reset"));
    },
  }));
}

describe("createQontoProvider response stream lifecycle", () => {
  it("retries a stream interruption after headers and recovers", async () => {
    const transport = sequenceFetch([
      interruptedResponse(), jsonResponse({ bank_accounts: [] }),
    ]);
    const waits: number[] = [];
    const provider = createQontoProvider({
      ...credentials, fetch: transport.fetch,
      sleep: async (milliseconds) => {
        expect(transport.requests[0]?.init?.signal?.aborted).toBe(true);
        waits.push(milliseconds);
      },
    });
    await expect(provider.listAccounts(1)).resolves.toEqual({ items: [], nextPage: null });
    expect(transport.requests).toHaveLength(2);
    expect(waits).toEqual([500]);
  });

  it("exhausts interrupted streams with only the stable unavailable error", async () => {
    const transport = sequenceFetch(Array.from({ length: 3 }, interruptedResponse));
    const waits: number[] = [];
    const provider = createQontoProvider({
      ...credentials, fetch: transport.fetch,
      sleep: async (milliseconds) => { waits.push(milliseconds); },
    });
    const error = await provider.listAccounts(1).catch((error: unknown) => error);
    expectIntegrationCode(error, "PROVIDER_UNAVAILABLE");
    expect((error as Error).message).not.toContain("private");
    expect((error as Error).cause).toBeUndefined();
    expect(transport.requests).toHaveLength(3);
    expect(waits).toEqual([500, 1_000]);
    expect(transport.requests.every(({ init }) => init?.signal?.aborted)).toBe(true);
  });

  it.each([
    [401, "PROVIDER_AUTH_EXPIRED", undefined, 1],
    [403, "PROVIDER_AUTH_EXPIRED", undefined, 1],
    [400, "PROVIDER_INVALID_RESPONSE", undefined, 1],
    [429, "PROVIDER_RATE_LIMIT", "6", 1],
    [429, "PROVIDER_RATE_LIMIT", undefined, 3],
    [503, "PROVIDER_UNAVAILABLE", undefined, 3],
  ] as const)("disposes open HTTP %i bodies before retry or return", async (status, code, retryAfter, attempts) => {
    const streams = Array.from({ length: attempts }, () => openResponse({
      status, headers: retryAfter ? { "retry-after": retryAfter } : undefined,
    }));
    const transport = sequenceFetch(streams.map(({ response }) => response));
    const provider = createQontoProvider({
      ...credentials, fetch: transport.fetch,
      sleep: async () => {
        const previous = transport.requests.length - 1;
        expect(streams[previous]?.cancellations()).toBe(1);
        expect(transport.requests[previous]?.init?.signal?.aborted).toBe(true);
      },
    });
    await expect(provider.listAccounts(1)).rejects.toMatchObject({ code });
    expect(transport.requests).toHaveLength(attempts);
    expect(streams.map((stream) => stream.cancellations())).toEqual(Array(attempts).fill(1));
    expect(transport.requests.every(({ init }) => init?.signal?.aborted)).toBe(true);
  });

  it.each(["declared size", "observed size", "malformed UTF-8"])(
    "disposes an open %s failure without retrying", async (failure) => {
      const stream = openResponse(
        failure === "declared size" ? { headers: { "content-length": "5242881" } } : undefined,
        failure === "observed size" ? new Uint8Array(5_242_881) : new Uint8Array([0xff]),
      );
      const transport = sequenceFetch([stream.response]);
      const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });
      await expect(provider.listAccounts(1)).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
      expect(transport.requests).toHaveLength(1);
      expect(stream.cancellations()).toBe(1);
      expect(transport.requests[0]?.init?.signal?.aborted).toBe(true);
    },
  );

  it.each([
    [401, "throw", "PROVIDER_AUTH_EXPIRED"],
    [401, "reject", "PROVIDER_AUTH_EXPIRED"],
    [401, "never resolve", "PROVIDER_AUTH_EXPIRED"],
    [200, "throw", "PROVIDER_INVALID_RESPONSE"],
    [200, "reject", "PROVIDER_INVALID_RESPONSE"],
    [200, "never resolve", "PROVIDER_INVALID_RESPONSE"],
  ] as const)(
    "preserves HTTP %i primary result when cancellation can %s", async (status, behavior, code) => {
      vi.useFakeTimers();
      const stream = openResponse({ status }, new Uint8Array([0xff]), () => {
        if (behavior === "throw") throw new Error("private cleanup failure");
        if (behavior === "reject") return Promise.reject(new Error("private cleanup failure"));
        return new Promise<void>(() => undefined);
      });
      const transport = sequenceFetch([stream.response]);
      const provider = createQontoProvider({ ...credentials, fetch: transport.fetch });
      let settled = false;
      const result = provider.listAccounts(1).catch((error: unknown) => { settled = true; return error; });
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
      expectIntegrationCode(await result, code);
      expect(stream.cancellations()).toBe(1);
      expect(transport.requests).toHaveLength(1);
      expect(transport.requests[0]?.init?.signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(["resolve", "never resolve"])("cancels stalled successful bodies on timeout when cancellation can %s", async (behavior) => {
    vi.useFakeTimers();
    const streams = Array.from({ length: 3 }, () => openResponse(undefined, undefined, () =>
      behavior === "resolve" ? undefined : new Promise<void>(() => undefined),
    ));
    const transport = sequenceFetch(streams.map(({ response }) => response));
    const provider = createQontoProvider({
      ...credentials, fetch: transport.fetch,
      sleep: async () => {
        const previous = transport.requests.length - 1;
        expect(streams[previous]?.cancellations()).toBe(1);
        expect(transport.requests[previous]?.init?.signal?.aborted).toBe(true);
      },
    });
    const result = provider.listAccounts(1).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(30_000);
    expectIntegrationCode(await result, "PROVIDER_UNAVAILABLE");
    expect(transport.requests).toHaveLength(3);
    expect(streams.map((stream) => stream.cancellations())).toEqual([1, 1, 1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("disposes a response arriving after its request deadline", async () => {
    vi.useFakeTimers();
    const late = openResponse({ status: 503 });
    let resolveFirst!: (response: Response) => void;
    let firstSignal: AbortSignal | null | undefined;
    let requests = 0;
    const provider = createQontoProvider({
      ...credentials,
      fetch: async (_input, init) => {
        requests += 1;
        if (requests === 1) {
          firstSignal = init?.signal;
          return new Promise<Response>((resolve) => { resolveFirst = resolve; });
        }
        return jsonResponse({ bank_accounts: [] });
      },
      sleep: async () => undefined,
    });
    const result = provider.listAccounts(1);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(result).resolves.toEqual({ items: [], nextPage: null });
    resolveFirst(late.response);
    await vi.advanceTimersByTimeAsync(0);
    expect(firstSignal?.aborted).toBe(true);
    expect(late.cancellations()).toBe(1);
    expect(requests).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
