"use client";

import { useActionState, useId, useState } from "react";

import { CategoryPicker } from "@/features/expenses/category-picker";
import type { ExpenseFormAction } from "@/features/expenses/expense-form";

import type { HistoryActionState } from "./history-actions";
import type { HistoryRecurringWorkspace } from "./history-schema";

export type HistoryFormAction = (
  state: HistoryActionState,
  formData: FormData,
) => Promise<HistoryActionState>;

export type HistoryFormWorkspace = Pick<
  HistoryRecurringWorkspace,
  | "transactionId"
  | "sourcePublication"
  | "label"
  | "amountCents"
  | "dayOfMonth"
  | "nextDate"
  | "currency"
  | "seriesState"
  | "existingExpenses"
  | "categories"
> & {
  possibleDuplicates: { label: string; amountCents: number }[];
};

const initialState: HistoryActionState = { success: false, message: null };

function centsToInput(value: number): string {
  return `${Math.trunc(value / 100)},${Math.abs(value % 100).toString().padStart(2, "0")}`;
}

function expenseOption(
  expense: { label: string; amountCents: number },
  currency: string,
): string {
  return `${expense.label} · ${centsToInput(expense.amountCents)} ${currency}`;
}

export function HistoryForm({
  action,
  createCategoryAction,
  workspace,
}: {
  action: HistoryFormAction;
  createCategoryAction: ExpenseFormAction;
  workspace: HistoryFormWorkspace;
}) {
  const [state, submit, pending] = useActionState(action, initialState);
  const [existingExpenseId, setExistingExpenseId] = useState("");
  const fieldId = useId();

  return (
    <form action={submit} className="commercial-form expense-form">
      <input type="hidden" name="transactionId" value={workspace.transactionId} />
      <input type="hidden" name="sourcePublication" value={workspace.sourcePublication} />
      <div className="form-grid">
        <div>
          <label htmlFor={`${fieldId}-label`}>Libellé</label>
          <input
            id={`${fieldId}-label`}
            name="label"
            defaultValue={workspace.label}
            maxLength={160}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-amount`}>Montant</label>
          <input
            id={`${fieldId}-amount`}
            name="amount"
            inputMode="decimal"
            defaultValue={centsToInput(workspace.amountCents)}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-frequency`}>Fréquence</label>
          <select id={`${fieldId}-frequency`} defaultValue="monthly" disabled>
            <option value="monthly">Mensuelle</option>
          </select>
          <small>La fréquence pourra être modifiée ensuite depuis la charge.</small>
        </div>
        <div>
          <label htmlFor={`${fieldId}-day`}>Jour du mois</label>
          <input
            id={`${fieldId}-day`}
            name="dayOfMonth"
            type="number"
            min={1}
            max={31}
            defaultValue={workspace.dayOfMonth}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-start`}>Première échéance</label>
          <input
            id={`${fieldId}-start`}
            name="startDate"
            type="date"
            defaultValue={workspace.nextDate}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-category`}>Catégorie</label>
          <CategoryPicker
            categories={workspace.categories}
            createAction={createCategoryAction}
            id={`${fieldId}-category`}
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-certainty`}>Niveau de certitude</label>
          <select id={`${fieldId}-certainty`} name="certainty" defaultValue="committed">
            <option value="certain">Certain</option>
            <option value="committed">Engagé</option>
            <option value="probable">Probable</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${fieldId}-probability`}>Probabilité (%)</label>
          <input
            id={`${fieldId}-probability`}
            name="probabilityPercent"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue="100"
            required
          />
        </div>
        <div className="form-grid-wide">
          <label htmlFor={`${fieldId}-existing`}>Charge mensuelle existante</label>
          <select
            id={`${fieldId}-existing`}
            name="existingExpenseId"
            value={existingExpenseId}
            onChange={(event) => setExistingExpenseId(event.target.value)}
          >
            <option value="">Créer une nouvelle charge</option>
            {workspace.existingExpenses.map((expense) => (
              <option key={expense.id} value={expense.id}>
                {expenseOption(expense, workspace.currency)}
              </option>
            ))}
          </select>
          <small>L’association conserve tous les champs de la charge existante.</small>
        </div>
        {workspace.possibleDuplicates.length > 0 && existingExpenseId === "" ? (
          <div className="form-grid-wide">
            <p>Une charge mensuelle similaire existe :</p>
            <ul>
              {workspace.possibleDuplicates.map((expense, index) => (
                <li key={`${expense.label}-${expense.amountCents}-${index}`}>
                  {expenseOption(expense, workspace.currency)}
                </li>
              ))}
            </ul>
            <label className="checkbox-field">
              <input name="allowDuplicate" type="checkbox" />
              Créer quand même une nouvelle charge
            </label>
          </div>
        ) : null}
        {workspace.seriesState === "dismissed" ? (
          <div className="form-grid-wide" role="alert">
            <p>
              Cette récurrence a déjà été ignorée. Confirmez qu’il s’agit d’une recréation
              volontaire.
            </p>
            <label className="checkbox-field">
              <input name="allowRecreate" type="checkbox" required />
              Recréer cette charge malgré la décision précédente
            </label>
          </div>
        ) : null}
      </div>
      {state.message ? <p role={state.success ? "status" : "alert"}>{state.message}</p> : null}
      {state.success && state.expenseId ? (
        <p>
          <a href={`/expenses#recurring-expense-${state.expenseId}`}>Ouvrir la charge</a>
        </p>
      ) : null}
      <button type="submit" disabled={pending}>
        {pending
          ? "Création en cours…"
          : existingExpenseId === ""
            ? "Créer la charge récurrente"
            : "Associer à la charge existante"}
      </button>
    </form>
  );
}
