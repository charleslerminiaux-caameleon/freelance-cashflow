import { describe, expect, it } from "vitest";

import { invoiceFormSchema, paymentFormSchema } from "./schema";

const customerId = "11111111-1111-4111-8111-111111111111";

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
        amount: "1 200,01",
        paidAt: "2026-09-20",
      }),
    ).toEqual({
      invoiceId: "22222222-2222-4222-8222-222222222222",
      amountCents: 120_001,
      paidAt: "2026-09-20",
    });
  });

  it.each(["0", "-0,01"])('rejects the non-positive amount "%s"', (amount) => {
    expect(
      paymentFormSchema.safeParse({
        invoiceId: "22222222-2222-4222-8222-222222222222",
        amount,
        paidAt: "2026-09-20",
      }).success,
    ).toBe(false);
  });
});
