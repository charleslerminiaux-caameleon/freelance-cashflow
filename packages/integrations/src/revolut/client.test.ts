import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createRevolutProvider } from "./client";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const credentials = {
  clientId: "client",
  refreshToken: "secret",
  issuer: "example.com",
  privateKey: keys.privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString(),
};
const json = (value: unknown) => new Response(JSON.stringify(value));
const window = {
  accountExternalId: "a",
  page: 1,
  updatedFrom: "2026-01-01T00:00:00Z",
  updatedTo: "2026-09-18T00:00:00Z",
  initialCreatedFrom: null,
  timezone: "Europe/Paris",
};
const transaction = {
  id: "tx",
  type: "transfer",
  state: "completed",
  created_at: "2025-12-31T23:30:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  completed_at: "2026-01-01T00:00:00Z",
  legs: [
    {
      leg_id: "leg",
      account_id: "a",
      amount: -12.34,
      currency: "EUR",
      description: "Coffee",
    },
  ],
};
function transport(payload: unknown) {
  return vi
    .fn()
    .mockResolvedValueOnce(
      json({ access_token: "access", token_type: "bearer", expires_in: 2399 }),
    )
    .mockImplementation(async () => json(payload));
}
describe("Revolut read-only provider", () => {
  it("refreshes with a signed assertion and normalizes account balances", async () => {
    const fetch = transport([
      {
        id: "a",
        name: "Main",
        balance: 10.29,
        currency: "EUR",
        state: "active",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ]);
    const result = await createRevolutProvider({
      ...credentials,
      fetch,
    }).listAccounts(1);
    expect(result.items[0]?.currentBalanceCents).toBe(1029);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    const jwt = new URLSearchParams(String(init.body)).get("client_assertion")!;
    const parts = jwt.split(".");
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(parts.slice(0, 2).join(".")),
        keys.publicKey,
        Buffer.from(parts[2]!, "base64url"),
      ),
    ).toBe(true);
    expect(
      JSON.parse(Buffer.from(parts[1]!, "base64url").toString()),
    ).toMatchObject({
      iss: "example.com",
      sub: "client",
      aud: "https://revolut.com",
    });
    expect(init.redirect).toBe("error");
  });
  it("rescans history and uses stable leg/account IDs with business timezone dates", async () => {
    const fetch = transport([transaction]);
    const provider = createRevolutProvider({ ...credentials, fetch });
    const result = await provider.listTransactions(window);
    expect(result.items[0]).toMatchObject({
      externalId: "tx:leg:a",
      amountCents: 1234,
      direction: "outflow",
      transactionDate: "2026-01-01",
    });
    expect(
      new URL(String(fetch.mock.calls[1]?.[0])).searchParams.has("from"),
    ).toBe(false);
  });
  it("fails closed on invalid money, statuses and auth without leaking bodies", async () => {
    const provider = createRevolutProvider({
      ...credentials,
      fetch: transport([
        { ...transaction, legs: [{ ...transaction.legs[0], amount: 1.001 }] },
      ]),
    });
    await expect(provider.listTransactions(window)).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
    });
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("secret", { status: 401 }));
    await expect(
      createRevolutProvider({ ...credentials, fetch }).listAccounts(1),
    ).rejects.toMatchObject({ code: "PROVIDER_AUTH_EXPIRED" });
  });
  it("rejects out of sequence pages", async () => {
    await expect(
      createRevolutProvider({
        ...credentials,
        fetch: transport([]),
      }).listTransactions({ ...window, page: 2 }),
    ).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
  });
});
it("paginates using documented created_at cursor and rejects repeated provider rows", async () => {
  const batch = Array.from({ length: 1000 }, (_, i) => ({
    ...transaction,
    id: `tx${i}`,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, 1000 - i)).toISOString(),
  }));
  const fetch = transport(batch);
  fetch.mockImplementation(async (url: URL) =>
    json(url.searchParams.has("from") ? [batch.at(-1)] : batch),
  );
  const provider = createRevolutProvider({ ...credentials, fetch });
  const first = await provider.listTransactions(window);
  expect(first.nextPage).toBe(2);
  fetch.mockImplementation(async () =>
    json([{ ...transaction, id: "older", created_at: "2025-01-01T00:00:00Z" }]),
  );
  expect(
    (await provider.listTransactions({ ...window, page: 2 })).nextPage,
  ).toBeNull();
  expect(
    new URL(String(fetch.mock.calls.at(-1)?.[0])).searchParams.get("to"),
  ).toBe(batch.at(-1)?.created_at);
});
it("preserves sub-millisecond ordering used by Revolut cursors", async () => {
  const rows = [
    { ...transaction, id: "micro1", created_at: "2026-01-01T00:00:00.000002Z" },
    { ...transaction, id: "micro2", created_at: "2026-01-01T00:00:00.000001Z" },
  ];
  const fetch = transport(rows);
  expect(
    (
      await createRevolutProvider({ ...credentials, fetch }).listTransactions({
        ...window,
        updatedTo: "2026-01-01T00:00:00.000003Z",
      })
    ).items,
  ).toHaveLength(2);
});
it("fails closed if a full page ends in an ambiguous equal-timestamp boundary", async () => {
  const rows = Array.from({ length: 1000 }, (_, i) => ({
    ...transaction,
    id: `t${i}`,
  }));
  await expect(
    createRevolutProvider({
      ...credentials,
      fetch: transport(rows),
    }).listTransactions(window),
  ).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
});

it("collects both equal-timestamp rows when the page boundary cuts their group", async () => {
  const boundary = "2026-01-01T00:00:00.000001Z";
  const newer = Array.from({ length: 999 }, (_, i) => ({
    ...transaction,
    id: `newer${i}`,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, 1000 - i)).toISOString(),
  }));
  const tied = ["tie1", "tie2"].map((id) => ({
    ...transaction,
    id,
    created_at: boundary,
  }));
  const fetch = transport([]);
  fetch.mockImplementation(async (url: URL) => {
    if (url.searchParams.get("from") === boundary) return json(tied);
    if (url.searchParams.get("to") === boundary) return json([]);
    return json([...newer, tied[0]]);
  });
  const provider = createRevolutProvider({ ...credentials, fetch });
  const first = await provider.listTransactions(window);
  expect(first.items).toHaveLength(1001);
  expect(
    first.items.filter((item) => item.externalId.startsWith("tie")),
  ).toHaveLength(2);
  expect(
    (await provider.listTransactions({ ...window, page: 2 })).items,
  ).toEqual([]);
});
