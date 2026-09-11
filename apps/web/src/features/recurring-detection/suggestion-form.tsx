"use client";

import { useActionState, useId, useState } from "react";

import type { SuggestionActionState } from "./actions";

export type SuggestionFormAction = (
  state: SuggestionActionState,
  formData: FormData,
) => Promise<SuggestionActionState>;

export type CategoryOption = { id: string; name: string };
export type ExistingExpenseOption = { id: string; label: string; amountCents: number };

export type SuggestionFormValue = {
  id: string;
  label: string;
  amountCents: number;
  dayOfMonth: number;
  nextDate: string;
  sourcePublication: string;
  possibleDuplicates: ExistingExpenseOption[];
};

const initialState: SuggestionActionState = { success: false, message: null };

function centsToInput(value: number): string {
  return `${Math.trunc(value / 100)},${Math.abs(value % 100).toString().padStart(2, "0")}`;
}

function expenseOption(option: ExistingExpenseOption): string {
  return `${option.label} · ${centsToInput(option.amountCents)} €`;
}

export function SuggestionForm({
  action,
  categories,
  existingExpenses,
  suggestion,
}: {
  action: SuggestionFormAction;
  categories: CategoryOption[];
  existingExpenses: ExistingExpenseOption[];
  suggestion: SuggestionFormValue;
}) {
  const [state, submit, pending] = useActionState(action, initialState);
  const [existingExpenseId, setExistingExpenseId] = useState("");
  const fieldId = useId();
  const suffix = ` pour ${suggestion.label}`;

  return (
    <form action={submit} className="commercial-form expense-form">
      <input type="hidden" name="suggestionId" value={suggestion.id} />
      <input type="hidden" name="sourcePublication" value={suggestion.sourcePublication} />
      <div className="form-grid">
        <div>
          <label htmlFor={`${fieldId}-label`}>Libellé{suffix}</label>
          <input
            id={`${fieldId}-label`}
            name="label"
            defaultValue={suggestion.label}
            maxLength={160}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-amount`}>Montant{suffix}</label>
          <input
            id={`${fieldId}-amount`}
            name="amount"
            inputMode="decimal"
            defaultValue={centsToInput(suggestion.amountCents)}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-day`}>Jour du mois{suffix}</label>
          <input
            id={`${fieldId}-day`}
            name="dayOfMonth"
            inputMode="numeric"
            defaultValue={suggestion.dayOfMonth}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-start`}>Première échéance{suffix}</label>
          <input
            id={`${fieldId}-start`}
            name="startDate"
            type="date"
            defaultValue={suggestion.nextDate}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-category`}>Catégorie{suffix}</label>
          <select id={`${fieldId}-category`} name="categoryId" defaultValue="">
            <option value="">Sans catégorie</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${fieldId}-certainty`}>Niveau de certitude{suffix}</label>
          <select id={`${fieldId}-certainty`} name="certainty" defaultValue="committed">
            <option value="certain">Certain</option>
            <option value="committed">Engagé</option>
            <option value="probable">Probable</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${fieldId}-probability`}>Probabilité (%){suffix}</label>
          <input
            id={`${fieldId}-probability`}
            name="probabilityPercent"
            inputMode="decimal"
            defaultValue="100"
            required
          />
        </div>
        <div className="form-grid-wide">
          <label htmlFor={`${fieldId}-existing`}>Charge mensuelle existante{suffix}</label>
          <select
            id={`${fieldId}-existing`}
            name="existingExpenseId"
            value={existingExpenseId}
            onChange={(event) => setExistingExpenseId(event.target.value)}
          >
            <option value="">Créer une nouvelle charge</option>
            {existingExpenses.map((expense) => (
              <option key={expense.id} value={expense.id}>
                {expenseOption(expense)}
              </option>
            ))}
          </select>
          <small>L’association conserve tous les champs de la charge existante.</small>
        </div>
        {suggestion.possibleDuplicates.length > 0 && existingExpenseId === "" ? (
          <div className="form-grid-wide" role="alert">
            <p>Une charge mensuelle similaire existe :</p>
            <ul>
              {suggestion.possibleDuplicates.map((expense) => (
                <li key={expense.id}>{expenseOption(expense)}</li>
              ))}
            </ul>
            <label className="checkbox-field">
              <input name="allowDuplicate" type="checkbox" />
              Créer quand même une nouvelle charge
            </label>
          </div>
        ) : null}
      </div>
      {state.message ? <p role={state.success ? "status" : "alert"}>{state.message}</p> : null}
      <button
        type="submit"
        aria-label={
          pending
            ? "Confirmation en cours…"
            : existingExpenseId === ""
              ? `Confirmer ${suggestion.label}`
              : `Associer ${suggestion.label}`
        }
        disabled={pending}
      >
        {pending
          ? "Confirmation en cours…"
          : existingExpenseId === ""
            ? "Confirmer la récurrence"
            : "Associer la récurrence"}
      </button>
    </form>
  );
}

export function SuggestionStateForm({
  action,
  label,
  suggestionId,
  mode,
}: {
  action: SuggestionFormAction;
  label: string;
  suggestionId: string;
  mode: "dismiss" | "reexamine";
}) {
  const [state, submit, pending] = useActionState(action, initialState);
  const verb = mode === "dismiss" ? "Ignorer" : "Réexaminer";

  return (
    <form action={submit} className="commercial-form compact-form">
      <input type="hidden" name="suggestionId" value={suggestionId} />
      {state.message ? <p role={state.success ? "status" : "alert"}>{state.message}</p> : null}
      <button type="submit" aria-label={`${verb} ${label}`} disabled={pending}>
        {pending ? `${verb}…` : verb}
      </button>
    </form>
  );
}

export function AnalyzeRecurringForm({ action }: { action: SuggestionFormAction }) {
  const [state, submit, pending] = useActionState(action, initialState);

  return (
    <form action={submit} className="commercial-form compact-form">
      <button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Analyse en cours…" : "Analyser les transactions importées"}
      </button>
      {state.message ? <p role={state.success ? "status" : "alert"}>{state.message}</p> : null}
    </form>
  );
}
