import { createPrivateKey, sign } from "node:crypto";
import { z } from "zod";
import type { BankingProvider, NormalizedBankTransaction } from "../banking";
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
  textId,
  unique,
  validateWindow,
} from "../direct";
// Preserve the microseconds used by the provider's exclusive pagination cursor.
function orderedInstant(value: string): bigint {
  const fraction = value.match(/\.(\d+)/)?.[1] ?? "";
  if (fraction.length > 9) throw invalid();
  return (
    BigInt(Date.parse(value)) * 1000000n +
    BigInt(fraction.padEnd(9, "0").slice(3))
  );
}
const base = "https://b2b.revolut.com/api/1.0/";
const accountSchema = z.object({
  id: textId,
  name: z.string().max(1000).optional(),
  balance: z.number().finite(),
  currency,
  state: z.enum(["active", "inactive"]),
  updated_at: instant,
});
const transactionSchema = z.object({
  id: textId,
  type: z.string().min(1),
  state: z.enum([
    "created",
    "pending",
    "completed",
    "declined",
    "failed",
    "reverted",
  ]),
  created_at: instant,
  updated_at: instant,
  completed_at: instant.optional(),
  reference: z.string().max(10000).optional(),
  merchant: z.object({ name: z.string() }).optional(),
  legs: z
    .array(
      z.object({
        leg_id: textId,
        account_id: textId,
        amount: z.number().finite(),
        currency,
        description: z.string().max(10000).optional(),
      }),
    )
    .min(1)
    .max(100),
});
export type CreateRevolutProviderOptions = {
  clientId: string;
  refreshToken: string;
  privateKey: string;
  issuer: string;
  fetch?: typeof fetch;
};
/** Business API READ OAuth; a new assertion is generated whenever the access token expires. */
export function createRevolutProvider(
  options: CreateRevolutProviderOptions,
): BankingProvider {
  const clientId = credential(options.clientId),
    refreshToken = credential(options.refreshToken),
    issuer = credential(options.issuer);
  let key: ReturnType<typeof createPrivateKey>;
  try {
    key = createPrivateKey(options.privateKey);
    if (key.asymmetricKeyType !== "rsa") throw invalid();
  } catch {
    throw invalid();
  }
  const fetcher = options.fetch ?? globalThis.fetch;
  let accessToken = "";
  let expires = 0;
  const cursors = new Map<string, Map<number, string>>();
  const seen = new Map<string, Set<string>>();
  async function token(signal?: AbortSignal) {
    if (Date.now() < expires) return accessToken;
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: issuer, sub: clientId, aud: "https://revolut.com", exp: Math.floor(Date.now() / 1000) + 300 })}`;
    const assertion = `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), key).toString("base64url")}`;
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_assertion_type:
        "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: assertion,
    });
    const result = parse(
      z.object({
        access_token: z.string().min(1).max(10000),
        expires_in: z.number().int().positive(),
        token_type: z.string().regex(/^bearer$/i),
      }),
      await request(
        fetcher,
        new URL("auth/token", base),
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        },
        signal,
      ),
    );
    accessToken = credential(result.access_token);
    expires = Date.now() + Math.max(0, result.expires_in - 30) * 1000;
    return accessToken;
  }
  async function get(url: URL, signal?: AbortSignal) {
    return request(
      fetcher,
      url,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${await token(signal)}` },
      },
      signal,
    );
  }
  return {
    async listAccounts(page, signal) {
      if (pageNumber(page) !== 1) throw invalid();
      const accounts = parse(
        z.array(accountSchema).max(10000),
        await get(new URL("accounts", base), signal),
      );
      unique(accounts.map((a) => a.id));
      return {
        items: accounts.map((a) => ({
          externalId: a.id,
          name: a.name || `${a.currency} Revolut`,
          ibanMasked: null,
          currency: a.currency,
          currentBalanceCents: cents(a.balance),
          availableBalanceCents: null,
          status:
            a.state === "active" ? ("active" as const) : ("closed" as const),
          updatedAt: a.updated_at,
        })),
        nextPage: null,
      };
    },
    async listTransactions(window, signal) {
      validateWindow(window);
      const id = window.accountExternalId;
      const scope = JSON.stringify([
        id,
        window.updatedTo,
        window.initialCreatedFrom,
      ]);
      if (window.page === 1) {
        cursors.set(scope, new Map([[1, window.updatedTo]]));
        seen.set(scope, new Set());
      }
      const cursor = cursors.get(scope)?.get(window.page);
      if (!cursor) throw invalid();
      const url = new URL("transactions", base);
      url.searchParams.set("account", id);
      url.searchParams.set("count", "1000");
      url.searchParams.set("to", cursor);
      if (window.initialCreatedFrom)
        url.searchParams.set("from", window.initialCreatedFrom);
      const transactions = parse(
        z.array(transactionSchema).max(1000),
        await get(url, signal),
      );
      unique(transactions.map((t) => t.id));
      // `from` is inclusive and `to` is exclusive. Before advancing past
      // the last timestamp, collect its entire group in a bounded overlap.
      // A full probe cannot prove completeness, so fail instead of skipping.
      const fullPage = transactions.length === 1000;
      const boundary = transactions.at(-1)?.created_at;
      if (fullPage && boundary) {
        const probeUrl = new URL(url);
        const nextMillisecond = new Date(
          Date.parse(boundary) + 1,
        ).toISOString();
        const probeTo =
          orderedInstant(nextMillisecond) < orderedInstant(cursor)
            ? nextMillisecond
            : cursor;
        probeUrl.searchParams.set("from", boundary);
        probeUrl.searchParams.set("to", probeTo);
        const probe = parse(
          z.array(transactionSchema).max(999),
          await get(probeUrl, signal),
        );
        unique(probe.map((t) => t.id));
        const originalIds = new Set(transactions.map((t) => t.id));
        const probeIds = new Set(probe.map((t) => t.id));
        for (const t of transactions) {
          if (
            orderedInstant(t.created_at) === orderedInstant(boundary) &&
            !probeIds.has(t.id)
          )
            throw invalid();
        }
        for (const t of probe) {
          const time = orderedInstant(t.created_at);
          if (
            time < orderedInstant(boundary) ||
            time >= orderedInstant(probeTo)
          )
            throw invalid();
          if (!originalIds.has(t.id)) {
            if (time !== orderedInstant(boundary)) throw invalid();
            transactions.push(t);
          }
        }
      }

      const ids = seen.get(scope)!;
      let previous = cursor;
      const items: NormalizedBankTransaction[] = [];
      for (const t of transactions) {
        if (
          orderedInstant(t.created_at) >= orderedInstant(cursor) ||
          orderedInstant(t.created_at) > orderedInstant(previous) ||
          ids.has(t.id)
        )
          throw invalid();
        previous = t.created_at;
        ids.add(t.id);
        const legs = t.legs.filter((l) => l.account_id === id);
        if (legs.length === 0) throw invalid();
        unique(legs.map((l) => l.leg_id));
        for (const leg of legs) {
          const amount = cents(leg.amount);
          items.push({
            externalId: `${t.id}:${leg.leg_id}:${id}`,
            accountExternalId: id,
            currency: leg.currency,
            amountCents: Math.abs(amount),
            direction: amount < 0 ? "outflow" : "inflow",
            status:
              t.state === "completed"
                ? "completed"
                : t.state === "reverted"
                  ? "reversed"
                  : t.state === "declined" || t.state === "failed"
                    ? "declined"
                    : "pending",
            label: leg.description || t.reference || t.type,
            counterparty: t.merchant?.name ?? null,
            transactionDate: businessDate(t.created_at, window.timezone),
            valueDate: t.completed_at
              ? businessDate(t.completed_at, window.timezone)
              : null,
            updatedAt: t.updated_at,
          });
        }
      }
      const nextPage = fullPage ? window.page + 1 : null;
      if (nextPage) {
        if (nextPage > 10000) throw invalid();
        cursors.get(scope)!.set(nextPage, boundary!);
      }
      return { items, nextPage };
    },
  };
}
