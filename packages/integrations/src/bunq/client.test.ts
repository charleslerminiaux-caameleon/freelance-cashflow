import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createBunqProvider } from "./client";
const server = generateKeyPairSync("rsa", { modulusLength: 2048 });
function response(payload: unknown) {
  const body = JSON.stringify(payload);
  return new Response(body, {
    headers: {
      "X-Bunq-Server-Signature": sign(
        "RSA-SHA256",
        Buffer.from(body),
        server.privateKey,
      ).toString("base64"),
    },
  });
}
const account = {
  id: 4,
  description: "Main",
  currency: "EUR",
  balance: { value: "12.34", currency: "EUR" },
  status: "ACTIVE",
  updated: "2026-01-01 00:00:00.000000",
  alias: [{ type: "IBAN", value: "NL91ABNA0417164300" }],
};
const payment = {
  id: 10,
  monetary_account_id: 4,
  amount: { value: "-0.29", currency: "EUR" },
  description: "Coffee",
  created: "2025-12-31 23:30:00.000000",
  updated: "2026-01-02 00:00:00.000000",
  counterparty_alias: { display_name: "Cafe" },
};
const window = {
  accountExternalId: "4",
  page: 1,
  updatedFrom: "2026-01-01T00:00:00Z",
  updatedTo: "2026-09-18T00:00:00Z",
  initialCreatedFrom: null,
  timezone: "Europe/Paris",
};
function transport(payload: unknown, older: string | null = null) {
  return vi
    .fn()
    .mockResolvedValueOnce(
      response({
        Response: [
          { Token: { token: "installation" } },
          {
            ServerPublicKey: {
              server_public_key: server.publicKey.export({
                format: "pem",
                type: "spki",
              }),
            },
          },
        ],
      }),
    )
    .mockResolvedValueOnce(response({ Response: [{ Id: { id: 1 } }] }))
    .mockResolvedValueOnce(
      response({
        Response: [{ Token: { token: "session" } }, { UserCompany: { id: 7 } }],
      }),
    )
    .mockImplementation(async () =>
      response({ Response: payload, Pagination: { older_url: older } }),
    );
}
describe("bunq read-only provider", () => {
  it("registers once, persists restricted context and reads masked accounts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "libra-bunq-"));
    try {
      const contextPath = join(dir, "context.json");
      const fetch = transport([{ MonetaryAccountBank: account }]);
      const provider = createBunqProvider({
        apiKey: "secret",
        contextPath,
        fetch,
      });
      const result = await provider.listAccounts(1);
      expect(result.items[0]).toMatchObject({
        externalId: "4",
        currentBalanceCents: 1234,
        ibanMasked: "NL91••••••••••4300",
      });
      expect((await stat(contextPath)).mode & 0o777).toBe(0o600);
      expect(await readFile(contextPath, "utf8")).not.toContain('"secret"');
      expect(fetch.mock.calls.map((c) => (c[1] as RequestInit).method)).toEqual(
        ["POST", "POST", "POST", "GET"],
      );
      expect(
        String((fetch.mock.calls[1]?.[1] as RequestInit).body),
      ).not.toContain("permitted_ips");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("normalizes payments with UTC source timestamps and stable account scoped IDs", async () => {
    const fetch = transport([{ Payment: payment }]);
    const result = await createBunqProvider({
      apiKey: "secret",
      contextPath: null,
      fetch,
    }).listTransactions(window);
    expect(result.items[0]).toMatchObject({
      externalId: "4:10",
      amountCents: 29,
      transactionDate: "2026-01-01",
      status: "completed",
    });
  });
  it("rejects malicious pagination before sending credentials elsewhere", async () => {
    const fetch = transport(
      [{ Payment: payment }],
      "https://evil.example/v1/user/7/monetary-account/4/payment",
    );
    await expect(
      createBunqProvider({
        apiKey: "secret",
        contextPath: null,
        fetch,
      }).listTransactions(window),
    ).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("rejects mismatched accounts and invalid server signatures", async () => {
    const fetch = transport([
      { Payment: { ...payment, monetary_account_id: 5 } },
    ]);
    await expect(
      createBunqProvider({
        apiKey: "secret",
        contextPath: null,
        fetch,
      }).listTransactions(window),
    ).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
    const bad = transport([]);
    bad.mockImplementation(async () => new Response('{"Response":[]}'));
    await expect(
      createBunqProvider({
        apiKey: "secret",
        contextPath: null,
        fetch: bad,
      }).listAccounts(1),
    ).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
  });
});
it("reuses persisted installation and starts a fresh session after restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "libra-bunq-"));
  try {
    const contextPath = join(dir, "context.json");
    await createBunqProvider({
      apiKey: "secret",
      contextPath,
      fetch: transport([]),
    }).listAccounts(1);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          Response: [
            { Token: { token: "session2" } },
            { UserPerson: { id: 7 } },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({ Response: [], Pagination: { older_url: null } }),
      );
    await createBunqProvider({
      apiKey: "secret",
      contextPath,
      fetch,
    }).listAccounts(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[0]?.[0])).toContain("/session-server");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("follows same-account older pages and rejects duplicate payments", async () => {
  const fetch = transport(
    [{ Payment: payment }],
    "/v1/user/7/monetary-account/4/payment?count=200&older_id=10",
  );
  const provider = createBunqProvider({
    apiKey: "secret",
    contextPath: null,
    fetch,
  });
  expect((await provider.listTransactions(window)).nextPage).toBe(2);
  fetch.mockImplementation(async () =>
    response({
      Response: [{ Payment: payment }],
      Pagination: { older_url: null },
    }),
  );
  await expect(
    provider.listTransactions({ ...window, page: 2 }),
  ).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
});
