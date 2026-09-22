import { afterEach, describe, expect, it, vi } from "vitest";
import { cents, request } from "./direct";
afterEach(() => vi.useRealTimers());
describe("direct bank transport", () => {
  it("uses exact decimal cents without rounding invalid precision", () => {
    expect(cents("90071992547409.91")).toBe(Number.MAX_SAFE_INTEGER);
    expect(cents(-0.29)).toBe(-29);
    for (const v of ["1.001", "1e5", "90071992547409.92"])
      expect(() => cents(v)).toThrow();
  });
  it("bounds a stuck response body even if transport ignores abort", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(new ReadableStream({ start() {} })));
    const result = request(
      fetch,
      new URL("https://public-api.bunq.com/v1/test"),
      { method: "GET" },
    );
    const assertion = expect(result).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
    await vi.advanceTimersByTimeAsync(10001);
    await assertion;
  });
  it("sanitizes failures and rejects oversized/redirected responses", async () => {
    for (const response of [
      new Response("secret", { headers: { "content-length": "9999999" } }),
      new Response("secret", { status: 429 }),
    ]) {
      await expect(
        request(
          vi.fn().mockResolvedValue(response),
          new URL("https://public-api.bunq.com/v1/test"),
          { method: "GET" },
        ),
      ).rejects.not.toThrow("secret");
    }
  });
  it("aborts before any fetch when the caller cancels", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn();
    await expect(
      request(
        fetch,
        new URL("https://public-api.bunq.com/v1/test"),
        { method: "GET" },
        controller.signal,
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
