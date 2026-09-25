import "server-only";
import { createPrivateKey, sign } from "node:crypto";

type RevolutCodeInput = { clientId: string; issuer: string; privateKey: string; code: string };
const invalid = () => new Error("Configuration Revolut invalide.");
const exchangeFailed = () => new Error("Impossible de connecter Revolut. Vérifiez le code d’autorisation et réessayez.");
const isToken = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 8192 && /^[^\s\p{Cc}]+$/u.test(value);
const isHostname = (value: unknown): value is string => typeof value === "string" && value.length <= 253 && value.split(".").every(label => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label));

export function buildRevolutAuthorizationUrl(clientId: string, redirectUri: string): string {
  if (!isToken(clientId) || typeof redirectUri !== "string" || redirectUri.length > 4096 || /[\s\p{Cc}]/u.test(redirectUri)) throw invalid();
  let redirect: URL;
  try { redirect = new URL(redirectUri); } catch { throw invalid(); }
  if (redirect.protocol !== "https:" || redirect.username || redirect.password || redirect.hash || !isHostname(redirect.hostname)) throw invalid();
  const url = new URL("https://business.revolut.com/app-confirm");
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "READ" }).toString();
  return url.toString();
}

export async function exchangeRevolutCode(input: RevolutCodeInput, fetcher: typeof fetch = fetch): Promise<{ clientId: string; issuer: string; privateKey: string; refreshToken: string }> {
  if (!input || !isToken(input.clientId) || !isToken(input.code) || !isHostname(input.issuer) || typeof input.privateKey !== "string" || input.privateKey.length > 16384) throw invalid();
  let key: ReturnType<typeof createPrivateKey>;
  try {
    key = createPrivateKey(input.privateKey);
    if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw invalid();
  } catch { throw invalid(); }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ iss: input.issuer, sub: input.clientId, aud: "https://revolut.com", exp: Math.floor(Date.now() / 1000) + 300 })).toString("base64url");
    const unsigned = `${header}.${payload}`;
    const assertion = `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), key).toString("base64url")}`;
    const response = await fetcher("https://b2b.revolut.com/api/1.0/auth/token", {
      method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: input.code, client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", client_assertion: assertion }).toString(),
    });
    if (!response.ok || !response.body) throw exchangeFailed();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) { await reader.cancel(); throw exchangeFailed(); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || typeof data !== "object" || !("refresh_token" in data) || !isToken(data.refresh_token)) throw exchangeFailed();
    return { clientId: input.clientId, issuer: input.issuer, privateKey: input.privateKey, refreshToken: data.refresh_token };
  } catch { throw exchangeFailed(); }
  finally { clearTimeout(timeout); }
}
