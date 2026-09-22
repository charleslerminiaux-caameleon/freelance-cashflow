"use client";

import { useActionState, useId, useState } from "react";

import type { OpportunityStatus } from "./schema";

export type CommercialActionState = {
  message: string | null;
  success: boolean;
};

export type CommercialFormAction = (
  state: CommercialActionState,
  formData: FormData,
) => Promise<CommercialActionState>;

type CustomerOption = { id: string; name: string };

export type OpportunityFormValue = {
  id: string;
  customerId: string;
  name: string;
  status: OpportunityStatus;
  estimatedAmountHt: string;
  probabilityPercent: string;
  expectedCloseDate: string;
  expectedStartDate: string;
  expectedEndDate: string;
  notes: string;
};

const initialState: CommercialActionState = { message: null, success: false };

const statuses: ReadonlyArray<{ value: OpportunityStatus; label: string }> = [
  { value: "lead", label: "Piste" },
  { value: "qualified", label: "Qualifiée" },
  { value: "proposal", label: "Proposition" },
  { value: "lost", label: "Perdue" },
];

export function OpportunityForm({
  action,
  customers,
  value,
}: {
  action: CommercialFormAction;
  customers: CustomerOption[];
  value?: OpportunityFormValue;
}) {
  const [state, submit, pending] = useActionState(action, initialState);
  const fieldId = useId();
  const editing = value !== undefined;

  return (
    <form action={submit} className="commercial-form">
      {value ? <input type="hidden" name="opportunityId" value={value.id} /> : null}
      <div className="form-grid">
        <div>
          <label htmlFor={`${fieldId}-customer`}>Client</label>
          <select
            id={`${fieldId}-customer`}
            name="customerId"
            defaultValue={value?.customerId ?? customers[0]?.id}
            required
          >
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${fieldId}-name`}>Nom</label>
          <input id={`${fieldId}-name`} name="name" defaultValue={value?.name} maxLength={200} required />
        </div>
        <div>
          <label htmlFor={`${fieldId}-status`}>Statut</label>
          <select id={`${fieldId}-status`} name="status" defaultValue={value?.status ?? "lead"}>
            {statuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${fieldId}-amount`}>Montant HT</label>
          <input
            id={`${fieldId}-amount`}
            name="estimatedAmountHt"
            inputMode="decimal"
            defaultValue={value?.estimatedAmountHt ?? "0,00"}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-probability`}>Probabilité (%)</label>
          <input
            id={`${fieldId}-probability`}
            name="probabilityPercent"
            inputMode="decimal"
            defaultValue={value?.probabilityPercent ?? "0"}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-close`}>Date de signature prévue</label>
          <input
            id={`${fieldId}-close`}
            aria-describedby={`${fieldId}-close-hint`}
            name="expectedCloseDate"
            type="date"
            defaultValue={value?.expectedCloseDate}
          />
          <p className="form-hint" id={`${fieldId}-close-hint`}>
            Date estimée de validation commerciale de l’opportunité.
          </p>
        </div>
        <div>
          <label htmlFor={`${fieldId}-start`}>Début prévu</label>
          <input
            id={`${fieldId}-start`}
            name="expectedStartDate"
            type="date"
            defaultValue={value?.expectedStartDate}
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-end`}>Fin prévue</label>
          <input
            id={`${fieldId}-end`}
            name="expectedEndDate"
            type="date"
            defaultValue={value?.expectedEndDate}
          />
        </div>
      </div>
      <div>
        <label htmlFor={`${fieldId}-notes`}>Notes</label>
        <textarea id={`${fieldId}-notes`} name="notes" defaultValue={value?.notes} maxLength={2_000} />
      </div>
      {state.message ? (
        <p role={state.success ? "status" : "alert"}>{state.message}</p>
      ) : null}
      <button type="submit" disabled={pending || customers.length === 0}>
        {editing ? "Enregistrer les modifications" : "Créer l’opportunité"}
      </button>
    </form>
  );
}

export function ConversionForm({
  action,
  opportunityId,
  opportunityName,
  paymentTermsDays,
  status,
  today,
  convertedEngagementId,
}: {
  action: CommercialFormAction;
  opportunityId: string;
  opportunityName: string;
  paymentTermsDays: number;
  status: OpportunityStatus;
  today: string;
  convertedEngagementId: string | null;
}) {
  const [state, submit, pending] = useActionState(action, initialState);
  const fieldId = useId();

  if (convertedEngagementId !== null || status === "won" || status === "lost") {
    return null;
  }

  return (
    <form action={submit} className="conversion-form">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <div>
        <label htmlFor={`${fieldId}-reference`}>Référence de commande</label>
        <input
          id={`${fieldId}-reference`}
          name="reference"
          defaultValue={opportunityName}
          maxLength={160}
          required
        />
      </div>
      <div>
        <label htmlFor={`${fieldId}-signed`}>Date de signature</label>
        <input id={`${fieldId}-signed`} name="signedAt" type="date" defaultValue={today} required />
      </div>
      <div>
        <label htmlFor={`${fieldId}-vat`}>TVA (%)</label>
        <input id={`${fieldId}-vat`} name="vatRatePercent" inputMode="decimal" defaultValue="20" required />
      </div>
      <div>
        <label htmlFor={`${fieldId}-terms`}>Délai de paiement (jours)</label>
        <input
          id={`${fieldId}-terms`}
          name="paymentTermsDays"
          inputMode="numeric"
          defaultValue={paymentTermsDays}
          required
        />
      </div>
      {state.message ? (
        <p role={state.success ? "status" : "alert"}>{state.message}</p>
      ) : null}
      <button type="submit" disabled={pending}>
        Convertir en commande
      </button>
    </form>
  );
}

export function DeleteOpportunityForm({
  action,
  opportunityId,
  opportunityName,
}: {
  action: CommercialFormAction;
  opportunityId: string;
  opportunityName: string;
}) {
  const [state, submit, pending] = useActionState(action, initialState);
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={submit} className="commercial-delete-form">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      {state.message ? (
        <p role={state.success ? "status" : "alert"}>{state.message}</p>
      ) : null}
      {confirming ? (
        <div
          className="commercial-delete-confirmation"
          role="group"
          aria-label={`Confirmation de suppression de l’opportunité ${opportunityName}`}
        >
          <p>Cette suppression est définitive.</p>
          <div>
            <button
              type="submit"
              aria-label={`Confirmer la suppression de l’opportunité ${opportunityName}`}
              disabled={pending}
            >
              Confirmer la suppression
            </button>
            <button
              type="button"
              className="commercial-delete-cancel"
              aria-label={`Annuler la suppression de l’opportunité ${opportunityName}`}
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
          aria-label={`Supprimer l’opportunité ${opportunityName}`}
          onClick={() => setConfirming(true)}
        >
          Supprimer
        </button>
      )}
    </form>
  );
}
