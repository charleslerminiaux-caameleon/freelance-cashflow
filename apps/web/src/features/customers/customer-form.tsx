"use client";

import { useActionState, useId, useState } from "react";

import type { CommercialFormAction } from "../opportunities/opportunity-form";

type CustomerFormValue = {
  id: string;
  name: string;
  email: string;
  paymentTermsDays: number;
  notes: string;
};

const initialState = { message: null, success: false };

export function CustomerForm({
  action,
  value,
}: {
  action: CommercialFormAction;
  value?: CustomerFormValue;
}) {
  const [state, submit, pending] = useActionState(action, initialState);
  const fieldId = useId();

  return (
    <form action={submit} className="commercial-form compact-form">
      {value ? <input type="hidden" name="customerId" value={value.id} /> : null}
      <div className="form-grid">
        <div>
          <label htmlFor={`${fieldId}-name`}>Nom du client</label>
          <input
            id={`${fieldId}-name`}
            name="name"
            defaultValue={value?.name}
            maxLength={160}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-email`}>E-mail</label>
          <input
            id={`${fieldId}-email`}
            name="email"
            type="email"
            defaultValue={value?.email}
            maxLength={254}
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-terms`}>Délai de paiement (jours)</label>
          <input
            id={`${fieldId}-terms`}
            name="paymentTermsDays"
            inputMode="numeric"
            defaultValue={value?.paymentTermsDays ?? 30}
            required
          />
        </div>
      </div>
      <div>
        <label htmlFor={`${fieldId}-notes`}>Notes client</label>
        <textarea id={`${fieldId}-notes`} name="notes" defaultValue={value?.notes} maxLength={2_000} />
      </div>
      {state.message ? <p role="alert">{state.message}</p> : null}
      <button type="submit" disabled={pending}>
        {value ? "Enregistrer le client" : "Créer le client"}
      </button>
    </form>
  );
}

export function CustomerDeleteForm({
  action,
  customerId,
  customerName,
}: {
  action: CommercialFormAction;
  customerId: string;
  customerName: string;
}) {
  const [state, submit, pending] = useActionState(action, initialState);
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={submit} className="commercial-delete-form">
      <input type="hidden" name="customerId" value={customerId} />
      {state.message ? (
        <p role={state.success ? "status" : "alert"}>{state.message}</p>
      ) : null}
      {confirming ? (
        <div
          className="commercial-delete-confirmation"
          role="group"
          aria-label={`Confirmation de suppression du client ${customerName}`}
        >
          <p>Cette suppression est définitive.</p>
          <div>
            <button
              type="submit"
              aria-label={`Confirmer la suppression du client ${customerName}`}
              disabled={pending}
            >
              Confirmer la suppression
            </button>
            <button
              type="button"
              className="commercial-delete-cancel"
              aria-label={`Annuler la suppression du client ${customerName}`}
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
          aria-label={`Supprimer le client ${customerName}`}
          onClick={() => setConfirming(true)}
        >
          Supprimer
        </button>
      )}
    </form>
  );
}
