"use client";

import { useActionState, useId, useState } from "react";

export type ExpenseActionState = {
  message: string | null;
  success: boolean;
};

export type ExpenseFormAction = (
  state: ExpenseActionState,
  formData: FormData,
) => Promise<ExpenseActionState>;

type CategoryOption = { id: string; name: string };

export type RecurringExpenseFormValue = {
  id: string;
  label: string;
  categoryId: string;
  cashflowKind: "expense" | "remuneration" | "reserve";
  amount: string;
  frequency: "monthly" | "quarterly" | "yearly";
  dayOfMonth: number;
  startDate: string;
  endDate: string;
  certainty: "certain" | "committed" | "probable";
  probabilityPercent: string;
  active: boolean;
};

export type PlannedExpenseFormValue = {
  id: string;
  label: string;
  categoryId: string;
  cashflowKind: "expense" | "remuneration" | "reserve";
  amount: string;
  plannedDate: string;
  certainty: "certain" | "committed" | "probable";
  probabilityPercent: string;
  status: "planned" | "realized" | "cancelled";
};

type ExpenseFormProps = {
  action: ExpenseFormAction;
  categories: CategoryOption[];
  today: string;
} & (
  | { mode: "recurring"; value?: RecurringExpenseFormValue }
  | { mode: "planned"; value?: PlannedExpenseFormValue }
);

const initialState: ExpenseActionState = { message: null, success: false };

const kinds = [
  { value: "expense", label: "Charge" },
  { value: "remuneration", label: "Rémunération" },
  { value: "reserve", label: "Réserve fiscale ou sociale" },
] as const;

const certainties = [
  { value: "certain", label: "Certain" },
  { value: "committed", label: "Engagé" },
  { value: "probable", label: "Probable" },
] as const;

export function ExpenseForm(props: ExpenseFormProps) {
  const [state, submit, pending] = useActionState(props.action, initialState);
  const fieldId = useId();
  const editing = props.value !== undefined;

  return (
    <form action={submit} className="commercial-form expense-form">
      {props.value ? <input type="hidden" name="expenseId" value={props.value.id} /> : null}
      <input type="hidden" name="mode" value={props.mode} />
      <div className="form-grid">
        <div>
          <label htmlFor={`${fieldId}-label`}>Libellé</label>
          <input
            id={`${fieldId}-label`}
            name="label"
            defaultValue={props.value?.label}
            maxLength={160}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-kind`}>Type de sortie</label>
          <select
            id={`${fieldId}-kind`}
            name="cashflowKind"
            defaultValue={props.value?.cashflowKind ?? "expense"}
          >
            {kinds.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${fieldId}-category`}>Catégorie</label>
          <select
            id={`${fieldId}-category`}
            name="categoryId"
            defaultValue={props.value?.categoryId ?? ""}
          >
            <option value="">Sans catégorie</option>
            {props.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${fieldId}-amount`}>Montant</label>
          <input
            id={`${fieldId}-amount`}
            name="amount"
            inputMode="decimal"
            defaultValue={props.value?.amount ?? "0,00"}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-certainty`}>Niveau de certitude</label>
          <select
            id={`${fieldId}-certainty`}
            name="certainty"
            defaultValue={props.value?.certainty ?? "certain"}
          >
            {certainties.map((certainty) => (
              <option key={certainty.value} value={certainty.value}>
                {certainty.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${fieldId}-probability`}>Probabilité (%)</label>
          <input
            id={`${fieldId}-probability`}
            name="probabilityPercent"
            inputMode="decimal"
            defaultValue={props.value?.probabilityPercent ?? "100"}
            required
          />
        </div>
        {props.mode === "recurring" ? (
          <>
            <div>
              <label htmlFor={`${fieldId}-frequency`}>Fréquence</label>
              <select
                id={`${fieldId}-frequency`}
                name="frequency"
                defaultValue={props.value?.frequency ?? "monthly"}
              >
                <option value="monthly">Mensuelle</option>
                <option value="quarterly">Trimestrielle</option>
                <option value="yearly">Annuelle</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${fieldId}-day`}>Jour du mois</label>
              <input
                id={`${fieldId}-day`}
                name="dayOfMonth"
                inputMode="numeric"
                defaultValue={props.value?.dayOfMonth ?? Number(props.today.slice(8, 10))}
                required
              />
            </div>
            <div>
              <label htmlFor={`${fieldId}-start`}>Début</label>
              <input
                id={`${fieldId}-start`}
                name="startDate"
                type="date"
                defaultValue={props.value?.startDate ?? props.today}
                required
              />
            </div>
            <div>
              <label htmlFor={`${fieldId}-end`}>Fin (facultative)</label>
              <input
                id={`${fieldId}-end`}
                name="endDate"
                type="date"
                defaultValue={props.value?.endDate}
              />
            </div>
            <label className="checkbox-field form-grid-wide">
              <input name="active" type="checkbox" defaultChecked={props.value?.active ?? true} />
              Active dans les prévisions
            </label>
          </>
        ) : (
          <>
            <div>
              <label htmlFor={`${fieldId}-planned-date`}>Date prévue</label>
              <input
                id={`${fieldId}-planned-date`}
                name="plannedDate"
                type="date"
                defaultValue={props.value?.plannedDate ?? props.today}
                required
              />
            </div>
            <div>
              <label htmlFor={`${fieldId}-status`}>Statut</label>
              <select
                id={`${fieldId}-status`}
                name="status"
                defaultValue={props.value?.status ?? "planned"}
              >
                <option value="planned">Planifiée</option>
                <option value="realized">Réalisée</option>
                <option value="cancelled">Annulée</option>
              </select>
            </div>
          </>
        )}
      </div>
      {state.message ? <p role={state.success ? "status" : "alert"}>{state.message}</p> : null}
      <button type="submit" disabled={pending}>
        {editing
          ? "Enregistrer la sortie"
          : props.mode === "recurring"
            ? "Créer la sortie récurrente"
            : "Créer la sortie ponctuelle"}
      </button>
    </form>
  );
}

export function DeleteExpenseForm({
  action,
  expenseId,
  expenseLabel,
  mode,
}: {
  action: ExpenseFormAction;
  expenseId: string;
  expenseLabel: string;
  mode: "recurring" | "planned";
}) {
  const [state, submit, pending] = useActionState(action, initialState);
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={submit} className="commercial-delete-form">
      <input type="hidden" name="expenseId" value={expenseId} />
      <input type="hidden" name="mode" value={mode} />
      {state.message ? <p role={state.success ? "status" : "alert"}>{state.message}</p> : null}
      {confirming ? (
        <div className="commercial-delete-confirmation" role="group" aria-label={`Confirmation de suppression de la sortie ${expenseLabel}`}>
          <p>Cette suppression est définitive.</p>
          <div>
            <button
              type="submit"
              aria-label={`Confirmer la suppression de la sortie ${expenseLabel}`}
              disabled={pending}
            >
              Confirmer la suppression
            </button>
            <button
              type="button"
              className="commercial-delete-cancel"
              aria-label={`Annuler la suppression de la sortie ${expenseLabel}`}
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          aria-label={`Supprimer la sortie ${expenseLabel}`}
          onClick={() => setConfirming(true)}
        >
          Supprimer
        </button>
      )}
    </form>
  );
}

export function CategoryForm({ action }: { action: ExpenseFormAction }) {
  const [state, submit, pending] = useActionState(action, initialState);
  const fieldId = useId();

  return (
    <form action={submit} className="commercial-form compact-form">
      <div>
        <label htmlFor={`${fieldId}-category-name`}>Nom de la catégorie</label>
        <input id={`${fieldId}-category-name`} name="name" maxLength={80} required />
      </div>
      {state.message ? <p role={state.success ? "status" : "alert"}>{state.message}</p> : null}
      <button type="submit" disabled={pending}>Ajouter la catégorie</button>
    </form>
  );
}

export function UpdateCategoryForm({
  action,
  categoryId,
  categoryName,
}: {
  action: ExpenseFormAction;
  categoryId: string;
  categoryName: string;
}) {
  const [state, submit, pending] = useActionState(action, initialState);
  const fieldId = useId();

  return (
    <form action={submit} className="commercial-form compact-form category-update-form">
      <input type="hidden" name="categoryId" value={categoryId} />
      <div>
        <label htmlFor={`${fieldId}-category-name`}>
          Nouveau nom de la catégorie {categoryName}
        </label>
        <input
          id={`${fieldId}-category-name`}
          name="name"
          defaultValue={categoryName}
          maxLength={80}
          required
        />
      </div>
      {state.message ? <p role={state.success ? "status" : "alert"}>{state.message}</p> : null}
      <button
        type="submit"
        aria-label={`Renommer la catégorie ${categoryName}`}
        disabled={pending}
      >
        Renommer
      </button>
    </form>
  );
}

export function DeleteCategoryForm({
  action,
  categoryId,
  categoryName,
}: {
  action: ExpenseFormAction;
  categoryId: string;
  categoryName: string;
}) {
  const [state, submit, pending] = useActionState(action, initialState);
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={submit} className="commercial-delete-form category-delete-form">
      <input type="hidden" name="categoryId" value={categoryId} />
      {state.message ? <p role={state.success ? "status" : "alert"}>{state.message}</p> : null}
      {confirming ? (
        <div
          className="commercial-delete-confirmation"
          role="group"
          aria-label={`Confirmation de suppression de la catégorie ${categoryName}`}
        >
          <p>Cette suppression est définitive. Les sorties conserveront leurs montants.</p>
          <div>
            <button
              type="submit"
              aria-label={`Confirmer la suppression de la catégorie ${categoryName}`}
              disabled={pending}
            >
              Confirmer la suppression
            </button>
            <button
              type="button"
              className="commercial-delete-cancel"
              aria-label={`Annuler la suppression de la catégorie ${categoryName}`}
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          aria-label={`Supprimer la catégorie ${categoryName}`}
          onClick={() => setConfirming(true)}
        >
          Supprimer
        </button>
      )}
    </form>
  );
}
