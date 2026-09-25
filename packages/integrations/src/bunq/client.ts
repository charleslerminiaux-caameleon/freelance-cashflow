import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
} from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { BankingProvider } from "../banking";
import {
  businessDate,
  cents,
  credential,
  currency,
  instant,
  invalid,
  pageNumber,
  parse,
  request,
  unique,
  validateWindow,
} from "../direct";
const origin = "https://public-api.bunq.com";
const id = z.number().int().positive().safe();
const timestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/)
  .transform((v) => v.replace(" ", "T") + "Z")
  .pipe(instant);
const amount = z.object({ value: z.string(), currency });
const accountSchema = z.object({
  id,
  description: z.string().max(10000),
  currency,
  balance: amount,
  status: z.enum(["ACTIVE", "BLOCKED", "CANCELLED", "PENDING_REOPEN"]),
  updated: timestamp,
  alias: z.array(z.object({ type: z.string(), value: z.string() })).default([]),
});
const paymentSchema = z.object({
  id,
  monetary_account_id: id,
  amount,
  description: z.string().max(10000),
  created: timestamp,
  updated: timestamp,
  counterparty_alias: z
    .object({
      display_name: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
});
const envelope = z.object({
  Response: z.array(z.record(z.string(), z.unknown())).max(10000),
  Pagination: z
    .object({ older_url: z.string().nullable().optional() })
    .optional(),
});
const contextSchema = z.object({
  fingerprint: z.string(),
  privateKey: z.string().min(1),
  installationToken: z.string().min(1),
  serverPublicKey: z.string().min(1),
  deviceRegistered: z.boolean(),
});
type Context = z.infer<typeof contextSchema>;
export type CreateBunqProviderOptions = {
  apiKey: string /** Persist authentication context outside public/source directories. Null disables persistence for tests. */;
  contextPath?: string | null;
  fetch?: typeof fetch;
};
/** Only authentication registration uses POST. Bank accounts and booked payments are GET-only. */
export function createBunqProvider(
  options: CreateBunqProviderOptions,
): BankingProvider {
  const apiKey = credential(options.apiKey),
    fingerprint = createHash("sha256").update(apiKey).digest("hex"),
    fetcher = options.fetch ?? globalThis.fetch;
  let context: Context | undefined;
  let sessionToken = "";
  let userId = 0;
  let initialization: Promise<void> | undefined;
  const cursors = new Map<string, Map<number, string>>();
  const seen = new Map<string, Set<string>>();
  async function persist() {
    if (!options.contextPath || !context) return;
    const target = options.contextPath;
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(temporary, JSON.stringify(context), {
        mode: 0o600,
        flag: "wx",
      });
      await rename(temporary, target);
    } catch {
      throw invalid();
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }
  async function call(
    path: string,
    method: "GET" | "POST",
    payload: unknown,
    token: string,
    signal?: AbortSignal,
  ) {
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Freelance Cashflow",
      "X-Bunq-Language": "en_US",
      "X-Bunq-Region": "nl_NL",
      "X-Bunq-Geolocation": "0 0 0 0 000",
      "X-Bunq-Client-Request-Id": randomUUID(),
    };
    if (token) headers["X-Bunq-Client-Authentication"] = credential(token);
    if (context && body)
      headers["X-Bunq-Client-Signature"] = sign(
        "RSA-SHA256",
        Buffer.from(body),
        context.privateKey,
      ).toString("base64");
    return parse(
      envelope,
      await request(
        fetcher,
        new URL(path, origin),
        { method, headers, ...(body === undefined ? {} : { body }) },
        signal,
        context
          ? (raw, response) => {
              const signature = response.headers.get("X-Bunq-Server-Signature");
              try {
                if (
                  !signature ||
                  !verify(
                    "RSA-SHA256",
                    Buffer.from(raw),
                    context!.serverPublicKey,
                    Buffer.from(signature, "base64"),
                  )
                )
                  throw invalid();
              } catch {
                throw invalid();
              }
            }
          : undefined,
      ),
    );
  }
  function object<T>(
    rows: Record<string, unknown>[],
    name: string,
    schema: z.ZodType<T>,
  ): T {
    const values = rows.filter((row) => Object.hasOwn(row, name));
    if (values.length !== 1) throw invalid();
    return parse(schema, values[0]![name]);
  }
  async function initialize(signal?: AbortSignal) {
    if (options.contextPath) {
      try {
        const saved = parse(
          contextSchema,
          JSON.parse(await readFile(options.contextPath, "utf8")),
        );
        if (saved.fingerprint === fingerprint) {
          createPrivateKey(saved.privateKey);
          context = saved;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw invalid();
      }
    }
    if (!context) {
      const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
      const installation = await call(
        "/v1/installation",
        "POST",
        {
          client_public_key: keys.publicKey
            .export({ type: "spki", format: "pem" })
            .toString(),
        },
        "",
        signal,
      );
      context = {
        fingerprint,
        privateKey: keys.privateKey
          .export({ type: "pkcs8", format: "pem" })
          .toString(),
        installationToken: object(
          installation.Response,
          "Token",
          z.object({ token: z.string().min(1) }),
        ).token,
        serverPublicKey: object(
          installation.Response,
          "ServerPublicKey",
          z.object({ server_public_key: z.string().min(1) }),
        ).server_public_key,
        deviceRegistered: false,
      };
      await persist();
    }
    if (!context.deviceRegistered) {
      const device = await call(
        "/v1/device-server",
        "POST",
        { description: "Freelance Cashflow read-only synchronization", secret: apiKey },
        context.installationToken,
        signal,
      );
      object(device.Response, "Id", z.object({ id }));
      context.deviceRegistered = true;
      await persist();
    }
    const session = await call(
      "/v1/session-server",
      "POST",
      { secret: apiKey },
      context.installationToken,
      signal,
    );
    sessionToken = object(
      session.Response,
      "Token",
      z.object({ token: z.string().min(1) }),
    ).token;
    const users = session.Response.flatMap((row) =>
      ["UserPerson", "UserCompany", "UserApiKey"]
        .filter((k) => Object.hasOwn(row, k))
        .map((k) => row[k]),
    );
    if (users.length !== 1) throw invalid();
    userId = parse(z.object({ id }), users[0]).id;
  }
  async function ready(signal?: AbortSignal) {
    initialization ??= initialize(signal).catch((error) => {
      initialization = undefined;
      throw error;
    });
    await initialization;
  }
  async function list(path: string, page: number, signal?: AbortSignal) {
    pageNumber(page);
    await ready(signal);
    const basePath = path.replace("{user}", String(userId));
    if (page === 1) {
      cursors.set(basePath, new Map([[1, `${basePath}?count=200`]]));
      seen.set(basePath, new Set());
    }
    const cursor = cursors.get(basePath)?.get(page);
    if (!cursor) throw invalid();
    const data = await call(cursor, "GET", undefined, sessionToken, signal);
    const older = data.Pagination?.older_url;
    if (!data.Pagination || older === undefined) throw invalid();
    let nextPage: number | null = null;
    if (older !== null) {
      let url: URL;
      try {
        url = new URL(older, origin);
      } catch {
        throw invalid();
      }
      if (
        url.origin !== origin ||
        url.pathname !== basePath ||
        url.username ||
        url.password ||
        url.hash ||
        !/^\d+$/.test(url.searchParams.get("older_id") ?? "") ||
        [...url.searchParams.keys()].some(
          (k) => k !== "older_id" && k !== "count",
        ) ||
        [...cursors.get(basePath)!.values()].includes(url.pathname + url.search)
      )
        throw invalid();
      if (data.Response.length === 0 || page >= 10000) throw invalid();
      nextPage = page + 1;
      cursors.get(basePath)!.set(nextPage, url.pathname + url.search);
    }
    return { ...data, nextPage, seen: seen.get(basePath)! };
  }
  return {
    async listAccounts(page, signal) {
      const data = await list(
        "/v1/user/{user}/monetary-account-bank",
        page,
        signal,
      );
      const accounts = data.Response.map((row) =>
        object([row], "MonetaryAccountBank", accountSchema),
      );
      unique(accounts.map((a) => String(a.id)));
      for (const a of accounts) {
        if (data.seen.has(String(a.id)) || a.balance.currency !== a.currency)
          throw invalid();
        data.seen.add(String(a.id));
      }
      return {
        items: accounts.map((a) => {
          const iban = a.alias.find((v) => v.type === "IBAN")?.value;
          if (iban && !/^[A-Z]{2}[A-Z0-9]{13,32}$/.test(iban)) throw invalid();
          return {
            externalId: String(a.id),
            name: a.description,
            ibanMasked: iban
              ? `${iban.slice(0, 4)}${"•".repeat(iban.length - 8)}${iban.slice(-4)}`
              : null,
            currency: a.currency,
            currentBalanceCents: cents(a.balance.value),
            availableBalanceCents: cents(a.balance.value),
            status:
              a.status === "CANCELLED"
                ? ("closed" as const)
                : ("active" as const),
            updatedAt: a.updated,
          };
        }),
        nextPage: data.nextPage,
      };
    },
    async listTransactions(window, signal) {
      validateWindow(window);
      if (!/^[1-9]\d*$/.test(window.accountExternalId)) throw invalid();
      const data = await list(
        `/v1/user/{user}/monetary-account/${window.accountExternalId}/payment`,
        window.page,
        signal,
      );
      const payments = data.Response.map((row) =>
        object([row], "Payment", paymentSchema),
      );
      unique(payments.map((p) => String(p.id)));
      for (const p of payments) {
        if (
          String(p.monetary_account_id) !== window.accountExternalId ||
          data.seen.has(String(p.id))
        )
          throw invalid();
        data.seen.add(String(p.id));
      }
      return {
        items: payments.map((p) => {
          const value = cents(p.amount.value);
          return {
            externalId: `${window.accountExternalId}:${p.id}`,
            accountExternalId: window.accountExternalId,
            currency: p.amount.currency,
            amountCents: Math.abs(value),
            direction: value < 0 ? ("outflow" as const) : ("inflow" as const),
            status: "completed" as const,
            label: p.description,
            counterparty:
              p.counterparty_alias?.display_name ??
              p.counterparty_alias?.name ??
              null,
            transactionDate: businessDate(p.created, window.timezone),
            valueDate: businessDate(p.created, window.timezone),
            updatedAt: p.updated,
          };
        }),
        nextPage: data.nextPage,
      };
    },
  };
}
