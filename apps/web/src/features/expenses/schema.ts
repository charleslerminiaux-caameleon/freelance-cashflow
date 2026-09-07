import { z } from "zod";

import {
  businessDateSchema,
  moneyInputSchema,
  optionalBusinessDateSchema,
  percentBasisPointsSchema,
} from "../commercial-schema";

export const expenseKindSchema = z.enum(["expense", "remuneration", "reserve"]);
export const expenseCertaintySchema = z.enum(["certain", "committed", "probable"]);

const categoryIdSchema = z.union([
  z.literal("").transform(() => null),
  z.string().uuid("Sélectionnez une catégorie valide."),
]);

const positiveMoneyInputSchema = moneyInputSchema.refine(
  (value) => value > 0,
  "Le montant doit être supérieur à zéro.",
);

const expenseFields = {
  label: z.string().trim().min(1, "Le libellé est requis.").max(160),
  categoryId: categoryIdSchema,
  cashflowKind: expenseKindSchema,
  amount: positiveMoneyInputSchema,
  certainty: expenseCertaintySchema,
  probabilityPercent: percentBasisPointsSchema,
};

export const recurringExpenseFormSchema = z
  .object({
    ...expenseFields,
    frequency: z.enum(["monthly", "quarterly", "yearly"]),
    dayOfMonth: z
      .string()
      .regex(/^\d+$/, "Saisissez un jour entier.")
      .transform(Number)
      .pipe(z.number().int().min(1).max(31)),
    startDate: businessDateSchema,
    endDate: optionalBusinessDateSchema,
    active: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.endDate !== null && value.endDate < value.startDate) {
      context.addIssue({
        code: "custom",
        message: "La date de fin ne peut pas précéder la date de début.",
        path: ["endDate"],
      });
    }
  })
  .transform(({ amount, probabilityPercent, ...value }) => ({
    ...value,
    amountCents: amount,
    probabilityBasisPoints: probabilityPercent,
  }));

export const plannedExpenseFormSchema = z
  .object({
    ...expenseFields,
    plannedDate: businessDateSchema,
    status: z.enum(["planned", "realized", "cancelled"]),
  })
  .transform(({ amount, probabilityPercent, ...value }) => ({
    ...value,
    amountCents: amount,
    probabilityBasisPoints: probabilityPercent,
  }));

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "Le nom de la catégorie est requis.").max(80),
});

export type ExpenseKind = z.infer<typeof expenseKindSchema>;
export type ExpenseCertainty = z.infer<typeof expenseCertaintySchema>;
export type RecurringExpenseCommand = z.output<typeof recurringExpenseFormSchema>;
export type PlannedExpenseCommand = z.output<typeof plannedExpenseFormSchema>;
export type CategoryCommand = z.output<typeof categoryFormSchema>;
