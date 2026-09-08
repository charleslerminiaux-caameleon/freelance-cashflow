"use client";

import { useActionState, useId } from "react";

import type { CommercialFormAction } from "../opportunities/opportunity-form";

const initialState = { message: null, success: false };

export function BillingScheduleForm({
  action,
  engagementId,
  paymentTermsDays,
}: {
  action: CommercialFormAction;
  engagementId: string;
  paymentTermsDays: number;
}) {
  const [state, submit, pending] = useActionState(action, initialState);
  const fieldId = useId();

  return (
    <form action={submit} className="commercial-form">
      <input type="hidden" name="engagementId" value={engagementId} />
      <div className="form-grid">
        <div>
          <label htmlFor={`${fieldId}-label`}>Libellé</label>
          <input id={`${fieldId}-label`} name="label" maxLength={160} required />
        </div>
        <div>
          <label htmlFor={`${fieldId}-invoice-date`}>Date de facturation prévue</label>
          <input id={`${fieldId}-invoice-date`} name="plannedInvoiceDate" type="date" required />
        </div>
        <div>
          <label htmlFor={`${fieldId}-amount`}>Montant HT</label>
          <input id={`${fieldId}-amount`} name="amountHt" inputMode="decimal" required />
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
      </div>
      <p className="form-hint">Le total TTC des échéances ne peut pas dépasser la commande.</p>
      {state.message ? (
        <p role={state.success ? "status" : "alert"}>{state.message}</p>
      ) : null}
      <button type="submit" disabled={pending}>
        Ajouter l’échéance
      </button>
    </form>
  );
}
