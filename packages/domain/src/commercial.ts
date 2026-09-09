import { moneyCents } from "@fc/shared";
import type { LocalDate, MoneyCents } from "@fc/shared";

export type OpportunityStatus = "lead" | "qualified" | "proposal" | "won" | "lost";

export type OpportunityConversionInput = {
  opportunityId: string;
  customerId: string;
  name: string;
  status: OpportunityStatus;
  amountHtCents: MoneyCents;
  vatRateBasisPoints: number;
  paymentTermsDays: number;
  signedAt: LocalDate;
};

export type OpportunityConversion = {
  engagement: {
    opportunityId: string;
    customerId: string;
    reference: string;
    signedAt: LocalDate;
    amountHtCents: MoneyCents;
    vatCents: MoneyCents;
    amountTtcCents: MoneyCents;
    paymentTermsDays: number;
  };
  nextOpportunityStatus: "won";
};

function calculateVatCents(amountHtCents: MoneyCents, vatRateBasisPoints: number): MoneyCents {
  if (!Number.isInteger(vatRateBasisPoints) || vatRateBasisPoints < 0 || vatRateBasisPoints > 10_000) {
    throw new Error("VAT rate must be integer basis points between 0 and 10000");
  }

  // Amounts are non-negative: adding half the divisor implements round-half-up exactly.
  const vatCents = (BigInt(amountHtCents) * BigInt(vatRateBasisPoints) + 5_000n) / 10_000n;
  return moneyCents(Number(vatCents));
}

export function convertOpportunity(input: OpportunityConversionInput): OpportunityConversion {
  if (input.status === "won" || input.status === "lost") {
    throw new Error("Opportunity cannot be converted");
  }

  if (
    input.amountHtCents < 0 ||
    !Number.isInteger(input.paymentTermsDays) ||
    input.paymentTermsDays < 0 ||
    input.paymentTermsDays > 365
  ) {
    throw new Error("Opportunity conversion input is invalid");
  }

  const vatCents = calculateVatCents(input.amountHtCents, input.vatRateBasisPoints);

  return {
    engagement: {
      opportunityId: input.opportunityId,
      customerId: input.customerId,
      reference: input.name,
      signedAt: input.signedAt,
      amountHtCents: input.amountHtCents,
      vatCents,
      amountTtcCents: moneyCents(input.amountHtCents + vatCents),
      paymentTermsDays: input.paymentTermsDays,
    },
    nextOpportunityStatus: "won",
  };
}
