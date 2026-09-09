import { describe, expect, it } from "vitest";

import {
  categoryFormSchema,
  plannedExpenseFormSchema,
  recurringExpenseFormSchema,
} from "./schema";

const recurringInput = {
  label: "Rémunération",
  categoryId: "",
  cashflowKind: "remuneration",
  amount: "3 500,00",
  frequency: "monthly",
  dayOfMonth: "31",
  startDate: "2026-01-31",
  endDate: "2026-04-30",
  certainty: "certain",
  probabilityPercent: "100",
  active: true,
};

describe("recurringExpenseFormSchema", () => {
  it("parses safe integer cents and recurrence fields", () => {
    expect(recurringExpenseFormSchema.parse(recurringInput)).toEqual({
      label: "Rémunération",
      categoryId: null,
      cashflowKind: "remuneration",
      amountCents: 350_000,
      frequency: "monthly",
      dayOfMonth: 31,
      startDate: "2026-01-31",
      endDate: "2026-04-30",
      certainty: "certain",
      probabilityBasisPoints: 10_000,
      active: true,
    });
  });

  it("rejects a non-positive amount and an inverted source range", () => {
    expect(() => recurringExpenseFormSchema.parse({ ...recurringInput, amount: "0" })).toThrow();
    expect(() =>
      recurringExpenseFormSchema.parse({
        ...recurringInput,
        startDate: "2026-05-01",
        endDate: "2026-04-30",
      }),
    ).toThrow("La date de fin ne peut pas précéder la date de début.");
  });
});

describe("plannedExpenseFormSchema", () => {
  it("parses a one-off reserve", () => {
    expect(
      plannedExpenseFormSchema.parse({
        label: "Réserve Urssaf",
        categoryId: "22222222-2222-4222-8222-222222222222",
        cashflowKind: "reserve",
        amount: "1200,50",
        plannedDate: "2026-10-15",
        certainty: "committed",
        probabilityPercent: "65",
        status: "planned",
      }),
    ).toMatchObject({
      categoryId: "22222222-2222-4222-8222-222222222222",
      amountCents: 120_050,
      probabilityBasisPoints: 6_500,
      status: "planned",
    });
  });
});

it("trims and validates an outflow category", () => {
  expect(categoryFormSchema.parse({ name: "  Logiciels  " })).toEqual({ name: "Logiciels" });
});
