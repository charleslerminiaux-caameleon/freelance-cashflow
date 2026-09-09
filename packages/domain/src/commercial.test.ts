import { describe, expect, it } from "vitest";

import { localDate, moneyCents } from "@fc/shared";
import { convertOpportunity } from "./commercial";

const input = {
  opportunityId: "opp-1",
  customerId: "customer-1",
  name: "Audit SI",
  status: "proposal" as const,
  amountHtCents: moneyCents(600_000),
  vatRateBasisPoints: 2_000,
  paymentTermsDays: 30,
  signedAt: localDate("2026-09-05"),
};

describe("convertOpportunity", () => {
  it("prepares a won engagement with VAT calculated in integer cents", () => {
    const conversion = convertOpportunity(input);

    expect(conversion).toEqual({
      engagement: {
        opportunityId: "opp-1",
        customerId: "customer-1",
        reference: "Audit SI",
        signedAt: "2026-09-05",
        amountHtCents: 600_000,
        vatCents: 120_000,
        amountTtcCents: 720_000,
        paymentTermsDays: 30,
      },
      nextOpportunityStatus: "won",
    });
  });

  it("rounds VAT half up when a basis-point calculation ends in half a cent", () => {
    const conversion = convertOpportunity({
      ...input,
      amountHtCents: moneyCents(5),
      vatRateBasisPoints: 1_000,
    });

    expect(conversion.engagement.vatCents).toBe(1);
    expect(conversion.engagement.amountTtcCents).toBe(6);
  });

  it.each(["won", "lost"] as const)("rejects a %s opportunity", (status) => {
    expect(() => convertOpportunity({ ...input, status })).toThrow(
      "Opportunity cannot be converted",
    );
  });

  it.each([
    { amountHtCents: moneyCents(-1), paymentTermsDays: 30 },
    { amountHtCents: moneyCents(100), paymentTermsDays: 366 },
  ])("rejects invalid commercial values", ({ amountHtCents, paymentTermsDays }) => {
    expect(() =>
      convertOpportunity({ ...input, amountHtCents, paymentTermsDays }),
    ).toThrow("Opportunity conversion input is invalid");
  });
});
