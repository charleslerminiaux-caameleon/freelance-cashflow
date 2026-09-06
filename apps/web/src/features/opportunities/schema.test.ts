import { describe, expect, it } from "vitest";

import { conversionFormSchema, opportunityFormSchema } from "./schema";

const customerId = "11111111-1111-4111-8111-111111111111";
const opportunityId = "22222222-2222-4222-8222-222222222222";

describe("opportunityFormSchema", () => {
  it("normalizes euros, percent and ISO business dates", () => {
    expect(
      opportunityFormSchema.parse({
        customerId,
        name: "  Audit SI  ",
        status: "proposal",
        estimatedAmountHt: "6 000,00",
        probabilityPercent: "75,25",
        expectedCloseDate: "2026-09-30",
        expectedStartDate: "2026-10-01",
        expectedEndDate: "2026-10-31",
        notes: "",
      }),
    ).toEqual({
      customerId,
      name: "Audit SI",
      status: "proposal",
      estimatedAmountHtCents: 600_000,
      probabilityBasisPoints: 7_525,
      expectedCloseDate: "2026-09-30",
      expectedStartDate: "2026-10-01",
      expectedEndDate: "2026-10-31",
      notes: null,
    });
  });

  it("rejects an end date before the start date", () => {
    expect(
      opportunityFormSchema.safeParse({
        customerId,
        name: "Audit SI",
        status: "qualified",
        estimatedAmountHt: "1000",
        probabilityPercent: "50",
        expectedCloseDate: "",
        expectedStartDate: "2026-10-10",
        expectedEndDate: "2026-10-09",
        notes: "",
      }).success,
    ).toBe(false);
  });

  it("reserves won status for the atomic conversion flow", () => {
    expect(
      opportunityFormSchema.safeParse({
        customerId,
        name: "Audit SI",
        status: "won",
        estimatedAmountHt: "1000",
        probabilityPercent: "100",
        expectedCloseDate: "",
        expectedStartDate: "",
        expectedEndDate: "",
        notes: "",
      }).success,
    ).toBe(false);
  });
});

describe("conversionFormSchema", () => {
  it("normalizes conversion input without floating-point money", () => {
    expect(
      conversionFormSchema.parse({
        opportunityId,
        reference: " CMD-2026-001 ",
        signedAt: "2026-09-05",
        vatRatePercent: "20",
        paymentTermsDays: "30",
      }),
    ).toEqual({
      opportunityId,
      reference: "CMD-2026-001",
      signedAt: "2026-09-05",
      vatRateBasisPoints: 2_000,
      paymentTermsDays: 30,
    });
  });

  it("rejects malformed dates and VAT rates outside 0–100 percent", () => {
    expect(
      conversionFormSchema.safeParse({
        opportunityId,
        reference: "CMD-2026-001",
        signedAt: "2026-02-30",
        vatRatePercent: "100,01",
        paymentTermsDays: "30",
      }).success,
    ).toBe(false);
  });
});
