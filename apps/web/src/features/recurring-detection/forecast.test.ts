import { localDate } from "@fc/shared";
import { expect, it } from "vitest";
import { paidMonthsByExpense } from "./forecast";
const series = { state: "confirmed" as const, linkedExpenseId: "expense", accountId: "a", currency: "EUR", normalizedLabel: "cloud", amountCents: 1000 };
const tx = { id: "t", bank_account_id: "a", currency: "EUR", label: "Cloud", amount_cents: 1000, direction: "outflow" as const, status: "completed", transaction_date: localDate("2026-09-02") };
it("only confirmed linked series exclude payments, using observed amount despite edited expenses", () => {
  expect(paidMonthsByExpense([series], [tx])).toEqual({ expense: ["2026-09"] });
  expect(paidMonthsByExpense([{ ...series, state: "pending", linkedExpenseId: null }], [tx])).toEqual({});
});
it("reversed payments restore projection", () => {
  expect(paidMonthsByExpense([series], [{ ...tx, status: "reversed" }])).toEqual({ expense: [] });
});
it("partitions full identities while retaining conflicting duplicate-ID rejection", () => {
  const other = { ...series, linkedExpenseId: "other", normalizedLabel: "other" };
  const unrelated = { ...series, linkedExpenseId: "unrelated", accountId: "b" };
  const evidence = [tx, { ...tx, id: "other-tx", label: "Other" }, { ...tx, id: "b-tx", bank_account_id: "b" }];
  expect(paidMonthsByExpense([series, other, unrelated], evidence)).toEqual({ expense: ["2026-09"], other: ["2026-09"], unrelated: ["2026-09"] });
  expect(paidMonthsByExpense([series, other, unrelated], [...evidence, { ...tx, label: "Other" }])).toEqual({ expense: [], other: [], unrelated: ["2026-09"] });
  expect(paidMonthsByExpense([series], [tx, { ...tx, amount_cents: 1050 }])).toEqual({ expense: [] });
  expect(paidMonthsByExpense([series], [tx, tx])).toEqual({ expense: ["2026-09"] });
});
