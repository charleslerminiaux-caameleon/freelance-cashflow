"use client";

import { useActionState, useId } from "react";

import type { InvoiceFormAction } from "./invoice-form";

type EditableInvoice = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  issuedAt: string;
  dueAt: string;
  expectedPaymentDate: string;
  amountHtCents: number;
  vatCents: number;
};

function centsToInput(cents: number): string {
  const whole = Math.trunc(cents / 100);
  const fraction = Math.abs(cents % 100).toString().padStart(2, "0");
  return `${whole},${fraction}`;
}

const initialState = { message: null, success: false };

export function InvoiceEditForm({
  action,
  customers,
  invoice,
}: {
  action: InvoiceFormAction;
  customers: { id: string; name: string }[];
  invoice: EditableInvoice;
}) {
  const [state, submit, pending] = useActionState(action, initialState);
  const fieldId = useId();

  return (
    <form action={submit} className="commercial-form invoice-form">
      <input type="hidden" name="invoiceId" value={invoice.id} />
      <div className="form-grid">
        <div>
          <label htmlFor={`${fieldId}-number`}>Numéro de facture</label>
          <input id={`${fieldId}-number`} name="invoiceNumber" defaultValue={invoice.invoiceNumber} maxLength={160} required />
        </div>
        <div>
          <label htmlFor={`${fieldId}-customer`}>Client</label>
          <select id={`${fieldId}-customer`} name="customerId" defaultValue={invoice.customerId} required>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${fieldId}-issued`}>Date d’émission</label>
          <input id={`${fieldId}-issued`} aria-describedby={`${fieldId}-issued-hint`} name="issuedAt" type="date" defaultValue={invoice.issuedAt} required />
          <p className="form-hint" id={`${fieldId}-issued-hint`}>Date à laquelle la facture est établie.</p>
        </div>
        <div>
          <label htmlFor={`${fieldId}-due`}>Date d’échéance</label>
          <input id={`${fieldId}-due`} aria-describedby={`${fieldId}-due-hint`} name="dueAt" type="date" defaultValue={invoice.dueAt} required />
          <p className="form-hint" id={`${fieldId}-due-hint`}>Date limite de paiement indiquée au client.</p>
        </div>
        <div>
          <label htmlFor={`${fieldId}-expected`}>Encaissement prévu</label>
          <input id={`${fieldId}-expected`} aria-describedby={`${fieldId}-expected-hint`} name="expectedPaymentDate" type="date" defaultValue={invoice.expectedPaymentDate} required />
          <p className="form-hint" id={`${fieldId}-expected-hint`}>Date à laquelle vous estimez recevoir l’argent. Utilisée pour la prévision de trésorerie.</p>
        </div>
        <div>
          <label htmlFor={`${fieldId}-amount`}>Montant HT</label>
          <input id={`${fieldId}-amount`} name="amountHt" inputMode="decimal" defaultValue={centsToInput(invoice.amountHtCents)} required />
        </div>
        <div>
          <label htmlFor={`${fieldId}-vat`}>TVA</label>
          <input id={`${fieldId}-vat`} name="vat" inputMode="decimal" defaultValue={centsToInput(invoice.vatCents)} required />
        </div>
      </div>
      <p className="form-hint">Le nouveau total ne peut pas être inférieur aux paiements conservés.</p>
      {state.message ? <p role={state.success ? "status" : "alert"}>{state.message}</p> : null}
      <button type="submit" disabled={pending}>Enregistrer les modifications</button>
    </form>
  );
}
