import { describe, expect, it } from "vitest";

import {
  invoiceFormSchema,
  invoiceUpdateFormSchema,
  paymentDeletionFormSchema,
  paymentFormSchema,
} from "./schema";

const customerId = "11111111-1111-4111-8111-111111111111";
const paymentIdempotencyKey = "33333333-3333-4333-8333-333333333333";

describe("invoiceFormSchema", () => {
  it("parses manual invoice amounts into exact integer cents", () => {
    expect(
      invoiceFormSchema.parse({
        invoiceNumber: " F-2026-001 ",
        customerId,
        billingScheduleItemId: "",
        issuedAt: "2026-09-01",
        dueAt: "2026-09-30",
        expectedPaymentDate: "2026-10-02",
        amountHt: "1 000,01",
        vat: "200,00",
      }),
    ).toEqual({
      invoiceNumber: "F-2026-001",
      customerId,
      billingScheduleItemId: null,
      issuedAt: "2026-09-01",
      dueAt: "2026-09-30",
      expectedPaymentDate: "2026-10-02",
      amountHtCents: 100_001,
      vatCents: 20_000,
      amountTtcCents: 120_001,
    });
  });

  it("rejects a due date before issue and an unsafe total", () => {
    const base = {
      invoiceNumber: "F-2026-001",
      customerId,
      billingScheduleItemId: "",
      issuedAt: "2026-09-30",
      dueAt: "2026-09-01",
      expectedPaymentDate: "2026-10-02",
      amountHt: "1",
      vat: "0",
    };

    expect(invoiceFormSchema.safeParse(base).success).toBe(false);
    expect(
      invoiceFormSchema.safeParse({
        ...base,
        dueAt: "2026-09-30",
        amountHt: "90071992547409,91",
        vat: "0,01",
      }).success,
    ).toBe(false);
  });
});

describe("paymentFormSchema", () => {
  it("accepts a positive exact-cent payment with an ISO business date", () => {
    expect(
      paymentFormSchema.parse({
        invoiceId: "22222222-2222-4222-8222-222222222222",
        idempotencyKey: paymentIdempotencyKey,
        amount: "1 200,01",
        paidAt: "2026-09-20",
      }),
    ).toEqual({
      invoiceId: "22222222-2222-4222-8222-222222222222",
      idempotencyKey: paymentIdempotencyKey,
      amountCents: 120_001,
      paidAt: "2026-09-20",
    });
  });

  it.each(["0", "-0,01"])('rejects the non-positive amount "%s"', (amount) => {
    expect(
      paymentFormSchema.safeParse({
        invoiceId: "22222222-2222-4222-8222-222222222222",
        idempotencyKey: paymentIdempotencyKey,
        amount,
        paidAt: "2026-09-20",
      }).success,
    ).toBe(false);
  });

  it("rejects a missing or malformed payment idempotency key", () => {
    const input = {
      invoiceId: "22222222-2222-4222-8222-222222222222",
      amount: "1,00",
      paidAt: "2026-09-20",
    };

    expect(paymentFormSchema.safeParse(input).success).toBe(false);
    expect(paymentFormSchema.safeParse({ ...input, idempotencyKey: "retry-1" }).success).toBe(
      false,
    );
  });
});

it("parses an invoice correction with its existing invoice id", () => {
  expect(
    invoiceUpdateFormSchema.parse({
      invoiceId: "22222222-2222-4222-8222-222222222222",
      invoiceNumber: " F-2026-002 ",
      customerId,
      issuedAt: "2026-09-02",
      dueAt: "2026-10-02",
      expectedPaymentDate: "2026-10-05",
      amountHt: "1 500,00",
      vat: "300,00",
    }),
  ).toEqual({
    invoiceId: "22222222-2222-4222-8222-222222222222",
    invoiceNumber: "F-2026-002",
    customerId,
    issuedAt: "2026-09-02",
    dueAt: "2026-10-02",
    expectedPaymentDate: "2026-10-05",
    amountHtCents: 150_000,
    vatCents: 30_000,
    amountTtcCents: 180_000,
  });
});

it("requires both invoice and payment ids to remove one payment", () => {
  expect(
    paymentDeletionFormSchema.parse({
      invoiceId: "22222222-2222-4222-8222-222222222222",
      paymentId: "44444444-4444-4444-8444-444444444444",
    }),
  ).toEqual({
    invoiceId: "22222222-2222-4222-8222-222222222222",
    paymentId: "44444444-4444-4444-8444-444444444444",
  });
});
