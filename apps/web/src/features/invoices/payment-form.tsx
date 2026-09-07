"use client";

import { formatMoney, moneyCents } from "@fc/shared";
import { useActionState, useEffect, useId, useState } from "react";

import type { InvoiceFormAction } from "./invoice-form";

function centsToInput(cents: number): string {
  return `${Math.trunc(cents / 100)},${(cents % 100).toString().padStart(2, "0")}`;
}

const initialState = { message: null, success: false };

export function PaymentForm({
  action,
  invoiceId,
  initialIdempotencyKey,
  remainingCents,
  today,
}: {
  action: InvoiceFormAction;
  invoiceId: string;
  initialIdempotencyKey: string;
  remainingCents: number;
  today: string;
}) {
  const [state, submit, pending] = useActionState(action, initialState);
  const [idempotencyKey, setIdempotencyKey] = useState(initialIdempotencyKey);
  const fieldId = useId();

  useEffect(() => {
    if (state.success && state.completedIdempotencyKey === idempotencyKey) {
      setIdempotencyKey(crypto.randomUUID());
    }
  }, [idempotencyKey, state.completedIdempotencyKey, state.success]);

  return (
    <form action={submit} className="commercial-form">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <p className="payment-balance">
        Solde restant <strong>{formatMoney(moneyCents(remainingCents))}</strong>
      </p>
      <div className="form-grid">
        <div>
          <label htmlFor={`${fieldId}-amount`}>Montant du paiement</label>
          <input
            id={`${fieldId}-amount`}
            name="amount"
            inputMode="decimal"
            defaultValue={centsToInput(remainingCents)}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-date`}>Date du paiement</label>
          <input id={`${fieldId}-date`} name="paidAt" type="date" defaultValue={today} required />
        </div>
      </div>
      {state.message ? <p role={state.success ? "status" : "alert"}>{state.message}</p> : null}
      <button type="submit" disabled={pending}>
        Enregistrer le paiement
      </button>
    </form>
  );
}
