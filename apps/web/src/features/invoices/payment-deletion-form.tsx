"use client";

import { useActionState } from "react";

import type { InvoiceFormAction } from "./invoice-form";

const initialState = { message: null, success: false };

export function PaymentDeletionForm({
  action,
  invoiceId,
  paymentId,
}: {
  action: InvoiceFormAction;
  invoiceId: string;
  paymentId: string;
}) {
  const [state, submit, pending] = useActionState(action, initialState);

  return (
    <form
      action={submit}
      className="commercial-delete-form invoice-payment-delete-form"
      onSubmit={(event) => {
        if (!window.confirm("Supprimer ce paiement ? Le solde et le statut de la facture seront recalculés.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="paymentId" value={paymentId} />
      {state.message ? <p role={state.success ? "status" : "alert"}>{state.message}</p> : null}
      <button type="submit" disabled={pending}>Supprimer ce paiement</button>
    </form>
  );
}
