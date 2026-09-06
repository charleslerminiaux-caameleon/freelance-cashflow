import { describe, expect, it } from "vitest";

import { billingScheduleFormSchema } from "./schema";

const engagementId = "33333333-3333-4333-8333-333333333333";

describe("billingScheduleFormSchema", () => {
  it("derives integer HT, VAT and TTC cents", () => {
    expect(
      billingScheduleFormSchema.parse({
        engagementId,
        label: " Acompte ",
        plannedInvoiceDate: "2026-09-15",
        amountHt: "1 000,01",
        vatRatePercent: "20",
        paymentTermsDays: "30",
      }),
    ).toEqual({
      engagementId,
      label: "Acompte",
      plannedInvoiceDate: "2026-09-15",
      amountHtCents: 100_001,
      vatCents: 20_000,
      amountTtcCents: 120_001,
      paymentTermsDays: 30,
      expectedPaymentDate: "2026-10-15",
    });
  });

  it("rejects zero amounts and invalid business dates", () => {
    expect(
      billingScheduleFormSchema.safeParse({
        engagementId,
        label: "Solde",
        plannedInvoiceDate: "2026-13-01",
        amountHt: "0",
        vatRatePercent: "20",
        paymentTermsDays: "30",
      }).success,
    ).toBe(false);
  });
});
