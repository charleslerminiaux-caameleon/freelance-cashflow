import { localDate, moneyCents } from "@fc/shared";
import { describe, expect, it } from "vitest";

import { applyPayment, deriveInvoiceStatus } from "./invoices";

describe("deriveInvoiceStatus", () => {
  const baseInput = {
    cancelled: false,
    amountTtcCents: moneyCents(100_000),
    paidAmountCents: moneyCents(0),
    dueAt: localDate("2026-10-01"),
    today: localDate("2026-09-05"),
  };

  it("marks an unpaid invoice overdue only after its due date", () => {
    expect(
      deriveInvoiceStatus({ ...baseInput, dueAt: localDate("2026-09-01") }),
    ).toBe("overdue");
    expect(
      deriveInvoiceStatus({ ...baseInput, dueAt: localDate("2026-09-05") }),
    ).toBe("issued");
  });

  it("gives cancellation precedence over every payment state", () => {
    expect(
      deriveInvoiceStatus({
        ...baseInput,
        cancelled: true,
        paidAmountCents: moneyCents(100_000),
        dueAt: localDate("2026-09-01"),
      }),
    ).toBe("cancelled");
  });

  it("gives full and partial payment precedence over lateness", () => {
    expect(
      deriveInvoiceStatus({
        ...baseInput,
        paidAmountCents: moneyCents(100_000),
        dueAt: localDate("2026-09-01"),
      }),
    ).toBe("paid");
    expect(
      deriveInvoiceStatus({
        ...baseInput,
        paidAmountCents: moneyCents(20_000),
        dueAt: localDate("2026-09-01"),
      }),
    ).toBe("partially_paid");
  });
});

describe("applyPayment", () => {
  it("returns the exact integer-cent paid total", () => {
    expect(
      applyPayment(moneyCents(100_000), moneyCents(75_000), moneyCents(25_000)),
    ).toBe(100_000);
  });

  it.each([0, -1])("rejects a non-positive payment of %i cents", (payment) => {
    expect(() =>
      applyPayment(moneyCents(100_000), moneyCents(75_000), moneyCents(payment)),
    ).toThrow("Payment must be positive");
  });

  it("rejects an overpayment", () => {
    expect(() =>
      applyPayment(moneyCents(100_000), moneyCents(75_000), moneyCents(25_001)),
    ).toThrow("Payment exceeds invoice balance");
  });

  it("rejects invalid invoice balances", () => {
    expect(() =>
      applyPayment(moneyCents(100_000), moneyCents(100_001), moneyCents(1)),
    ).toThrow("Invoice payment state is invalid");
  });

  it("rejects totals that exceed safe integer cents", () => {
    expect(() =>
      applyPayment(
        moneyCents(Number.MAX_SAFE_INTEGER),
        moneyCents(Number.MAX_SAFE_INTEGER - 1),
        moneyCents(2),
      ),
    ).toThrow("Payment exceeds invoice balance");
  });
});
