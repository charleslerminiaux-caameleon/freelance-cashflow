import { describe, expect, it } from "vitest";

import { IntegrationError } from "../errors";
import { fakeAccount, fakePendingTransaction, fakeTransaction } from "./fixtures";
import { normalizeAccount, normalizeTransaction } from "./normalize";

describe("normalizeAccount", () => {
  it("keeps exact signed cent balances and strips provider-only fields", () => {
    const normalized = normalizeAccount({
      ...fakeAccount,
      balance: "-1234.56",
      balance_cents: -123_456,
      authorized_balance: "-1200.00",
      authorized_balance_cents: -120_000,
    });

    expect(normalized).toEqual({
      externalId: "account-fake",
      name: "Compte principal fictif",
      ibanMasked: "FR76•••••••••••••••••••5566",
      currency: "EUR",
      currentBalanceCents: -123_456,
      availableBalanceCents: -120_000,
      status: "active",
      updatedAt: "2026-03-31T21:30:00.000Z",
    });
    expect(JSON.stringify(normalized)).not.toContain(fakeAccount.organization_id);
    expect(JSON.stringify(normalized)).not.toContain(fakeAccount.iban);
  });

  it("accepts a closed account and unavailable optional restricted fields", () => {
    expect(
      normalizeAccount({
        ...fakeAccount,
        status: "closed",
        iban: null,
        authorized_balance_cents: null,
      }),
    ).toMatchObject({ status: "closed", ibanMasked: null, availableBalanceCents: null });
  });

  it.each([
    ["unsafe current balance", { balance_cents: Number.MAX_SAFE_INTEGER + 1 }],
    ["fractional authorized balance", { authorized_balance_cents: 12.5 }],
    ["invalid currency", { currency: "euro" }],
    ["invalid instant", { updated_at: "2026-02-30T12:00:00Z" }],
  ])("rejects %s", (_case, change) => {
    expect(() => normalizeAccount({ ...fakeAccount, ...change })).toThrow();
  });

  it("rejects a missing required current balance without defaulting to zero", () => {
    const { balance_cents: _omitted, ...withoutBalance } = fakeAccount;

    expect(() => normalizeAccount(withoutBalance)).toThrow();
  });

  it("does not retain a rejected provider value in its error", () => {
    const rejectedValue = "private-invalid-currency";

    try {
      normalizeAccount({ ...fakeAccount, currency: rejectedValue });
      throw new Error("expected schema rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(IntegrationError);
      expect((error as IntegrationError).code).toBe("PROVIDER_INVALID_RESPONSE");
      expect((error as Error).message).not.toContain(rejectedValue);
      expect((error as Error).cause).toBeUndefined();
    }
  });
});

describe("normalizeTransaction", () => {
  it.each([
    ["pending", "pending"],
    ["completed", "completed"],
    ["declined", "declined"],
    ["reversed", "reversed"],
  ] as const)("normalizes the %s status", (providerStatus, normalizedStatus) => {
    expect(
      normalizeTransaction(
        { ...fakeTransaction, status: providerStatus },
        "account-fake",
        "Europe/Paris",
      ).status,
    ).toBe(normalizedStatus);
  });

  it("keeps a positive cent amount, derives direction, and strips sensitive details", () => {
    const normalized = normalizeTransaction(fakeTransaction, "account-fake", "Europe/Paris");

    expect(normalized).toEqual({
      externalId: "transaction-fake",
      accountExternalId: "account-fake",
      currency: "EUR",
      amountCents: 4_250,
      direction: "inflow",
      status: "completed",
      label: "Virement fictif",
      counterparty: null,
      transactionDate: "2026-04-01",
      valueDate: "2026-04-01",
      updatedAt: "2026-03-31T22:30:00.000Z",
    });
    expect(JSON.stringify(normalized)).not.toContain(fakeTransaction.note);
    expect(JSON.stringify(normalized)).not.toContain(
      fakeTransaction.transfer.counterparty_account_number,
    );
  });

  it("keeps an unsettled pending transaction nullable and maps debit to outflow", () => {
    expect(
      normalizeTransaction(fakePendingTransaction, "account-fake", "Europe/Paris"),
    ).toMatchObject({ valueDate: null, direction: "outflow" });
  });

  it.each([
    ["unsafe cents", { amount_cents: Number.MAX_SAFE_INTEGER + 1 }],
    ["negative cents", { amount_cents: -1 }],
    ["invalid currency", { currency: "EU" }],
    ["invalid business instant", { emitted_at: "tomorrow" }],
    ["invalid update instant", { updated_at: "2026-02-30T12:00:00Z" }],
  ])("rejects %s", (_case, change) => {
    expect(() =>
      normalizeTransaction(
        { ...fakeTransaction, ...change },
        "account-fake",
        "Europe/Paris",
      ),
    ).toThrow();
  });

  it("rejects an invalid timezone", () => {
    expect(() =>
      normalizeTransaction(fakeTransaction, "account-fake", "Mars/Olympus"),
    ).toThrow();
  });

  it("rejects a provider account mismatch when the transaction includes an account ID", () => {
    expect(() =>
      normalizeTransaction(
        { ...fakeTransaction, bank_account_id: "different-account" },
        "account-fake",
        "Europe/Paris",
      ),
    ).toThrow();
  });
});
