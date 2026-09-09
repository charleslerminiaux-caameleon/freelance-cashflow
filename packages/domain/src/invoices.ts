import { moneyCents } from "@fc/shared";
import type { LocalDate, MoneyCents } from "@fc/shared";

export type InvoiceStatus =
  | "draft"
  | "issued"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled";

export type InvoiceStatusInput = {
  cancelled: boolean;
  amountTtcCents: MoneyCents;
  paidAmountCents: MoneyCents;
  dueAt: LocalDate;
  today: LocalDate;
};

function assertPaymentState(amountTtcCents: MoneyCents, paidAmountCents: MoneyCents) {
  if (amountTtcCents < 0 || paidAmountCents < 0 || paidAmountCents > amountTtcCents) {
    throw new Error("Invoice payment state is invalid");
  }
}

export function deriveInvoiceStatus(input: InvoiceStatusInput): InvoiceStatus {
  assertPaymentState(input.amountTtcCents, input.paidAmountCents);

  if (input.cancelled) return "cancelled";
  if (input.paidAmountCents === input.amountTtcCents) return "paid";
  if (input.paidAmountCents > 0) return "partially_paid";
  if (input.dueAt < input.today) return "overdue";
  return "issued";
}

export function applyPayment(
  amountTtcCents: MoneyCents,
  paidAmountCents: MoneyCents,
  paymentAmountCents: MoneyCents,
): MoneyCents {
  assertPaymentState(amountTtcCents, paidAmountCents);

  if (paymentAmountCents <= 0) {
    throw new Error("Payment must be positive");
  }

  if (paymentAmountCents > amountTtcCents - paidAmountCents) {
    throw new Error("Payment exceeds invoice balance");
  }

  return moneyCents(paidAmountCents + paymentAmountCents);
}
