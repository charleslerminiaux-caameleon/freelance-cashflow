// @vitest-environment node
import { generateKeyPairSync, verify } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { buildRevolutAuthorizationUrl, exchangeRevolutCode } from "./revolut-onboarding";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const input = { clientId: "client_123", issuer: "libra.example.com", code: "oa_prod_code", privateKey: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
afterEach(() => vi.useRealTimers());

it("requests only READ consent and preserves the registered redirect URI", () => {
  const url = new URL(buildRevolutAuthorizationUrl(input.clientId, "https://libra.example.com/settings?bank=revolut"));
  expect(url.origin + url.pathname).toBe("https://business.revolut.com/app-confirm");
  expect(Object.fromEntries(url.searchParams)).toEqual({ client_id: "client_123", redirect_uri: "https://libra.example.com/settings?bank=revolut", response_type: "code", scope: "READ" });
});

it("signs an RS256 assertion and exchanges the code at the fixed endpoint", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-24T12:00:00Z"));
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    expect(url).toBe("https://b2b.revolut.com/api/1.0/auth/token");
    expect(options).toMatchObject({ method: "POST", redirect: "error", cache: "no-store", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    const form = new URLSearchParams(String(options?.body));
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("oa_prod_code");
    expect(form.get("client_assertion_type")).toBe("urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
    const [header, claims, signature] = form.get("client_assertion")!.split(".");
    if (!header || !claims || !signature) throw new Error("Missing JWT segments");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({ iss: "libra.example.com", sub: "client_123", aud: "https://revolut.com", exp: 1790251500 });
    expect(verify("RSA-SHA256", Buffer.from(`${header}.${claims}`), keys.publicKey, Buffer.from(signature, "base64url"))).toBe(true);
    return Response.json({ access_token: "access-secret", refresh_token: "refresh-secret", token_type: "bearer", expires_in: 2399 });
  });
  expect(await exchangeRevolutCode(input, fetcher)).toEqual({ clientId: input.clientId, issuer: input.issuer, privateKey: input.privateKey, refreshToken: "refresh-secret" });
});

it.each([
  { issuer: "https://example.com" }, { issuer: "example.com/path" }, { issuer: "example.com:443" },
  { issuer: "a..com" }, { code: "a\nsecret" }, { code: "a".repeat(8193) }, { clientId: "" },
  { privateKey: "malformed-private-secret" },
  { privateKey: generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString() },
  { privateKey: generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString() },
])("rejects invalid credentials before sending a request (%j)", async patch => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(exchangeRevolutCode({ ...input, ...patch }, fetcher)).rejects.toThrow("Configuration Revolut invalide.");
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(["http://example.com", "javascript:alert(1)", "https://user:secret@example.com", "https://example.com/#code"])("rejects unsafe redirect URI %s", redirect => {
  expect(() => buildRevolutAuthorizationUrl(input.clientId, redirect)).toThrow("Configuration Revolut invalide.");
});

it.each([
  () => new Response("provider-secret", { status: 400 }),
  () => new Response("provider-secret", { status: 200 }),
  () => Response.json({ access_token: "provider-secret" }),
  () => Response.json({ refresh_token: "secret\nheader" }),
  () => Response.json({ refresh_token: "a".repeat(8193) }),
  () => { throw new Error("network-private-secret"); },
])("returns a safe error for rejected, malformed or failed responses", async response => {
  await expect(exchangeRevolutCode(input, async () => response())).rejects.toThrow(/^Impossible de connecter Revolut\. Vérifiez le code d’autorisation et réessayez\.$/);
});

it("aborts an exchange that exceeds the deadline", async () => {
  vi.useFakeTimers();
  const promise = exchangeRevolutCode(input, async (_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => reject(new Error("secret timeout details")), { once: true });
  }));
  const rejected = expect(promise).rejects.toThrow("Impossible de connecter Revolut.");
  await vi.advanceTimersByTimeAsync(15_000);
  await rejected;
});
