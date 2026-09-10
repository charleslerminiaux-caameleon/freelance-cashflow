"use client";

import { useActionState, useId, useState } from "react";

import type { InvoiceActionState } from "./actions";

export type InvoiceFormAction = (
  state: InvoiceActionState,
  formData: FormData,
) => Promise<InvoiceActionState>;

type InvoiceFormSchedule = {
  id: string;
  label: string;
  reference: string;
  customerId: string;
  customerName: string;
  plannedInvoiceDate: string;
  expectedPaymentDate: string;
  amountHtCents: number;
  vatCents: number;
};

function centsToInput(cents: number): string {
  const whole = Math.trunc(cents / 100);
  const fraction = (cents % 100).toString().padStart(2, "0");
  return `${whole},${fraction}`;
}

const initialState: InvoiceActionState = { message: null, success: false };

export function InvoiceForm({
  action,
  customers,
  scheduleItems,
  today,
}: {
  action: InvoiceFormAction;
  customers: { id: string; name: string }[];
  scheduleItems: InvoiceFormSchedule[];
  today: string;
}) {
  const [state, submit, pending] = useActionState(action, initialState);
  const fieldId = useId();
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [issuedAt, setIssuedAt] = useState(today);
  const [dueAt, setDueAt] = useState(today);
  const [expectedPaymentDate, setExpectedPaymentDate] = useState(today);
  const [amountHt, setAmountHt] = useState("");
  const [vat, setVat] = useState("");

  function selectSchedule(scheduleId: string) {
    const schedule = scheduleItems.find((item) => item.id === scheduleId);
    if (!schedule) return;

    setCustomerId(schedule.customerId);
    setIssuedAt(schedule.plannedInvoiceDate);
    setDueAt(schedule.expectedPaymentDate);
    setExpectedPaymentDate(schedule.expectedPaymentDate);
    setAmountHt(centsToInput(schedule.amountHtCents));
    setVat(centsToInput(schedule.vatCents));
  }

  return (
    <form action={submit} className="commercial-form invoice-form">
      <div className="form-grid">
        <div>
          <label htmlFor={`${fieldId}-number`}>Numéro de facture</label>
          <input id={`${fieldId}-number`} name="invoiceNumber" maxLength={160} required />
        </div>
        <div>
          <label htmlFor={`${fieldId}-customer`}>Client</label>
          <select
            id={`${fieldId}-customer`}
            name="customerId"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            required
          >
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-grid-wide">
          <label htmlFor={`${fieldId}-schedule`}>Étape de facturation (facultative)</label>
          <select
            id={`${fieldId}-schedule`}
            name="billingScheduleItemId"
            defaultValue=""
            onChange={(event) => selectSchedule(event.target.value)}
          >
            <option value="">Aucune — facture manuelle</option>
            {scheduleItems.map((schedule) => (
              <option key={schedule.id} value={schedule.id}>
                {schedule.reference} · {schedule.label} · {schedule.customerName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${fieldId}-issued`}>Date d’émission</label>
          <input
            id={`${fieldId}-issued`}
            name="issuedAt"
            type="date"
            value={issuedAt}
            onChange={(event) => setIssuedAt(event.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-due`}>Date d’échéance</label>
          <input
            id={`${fieldId}-due`}
            name="dueAt"
            type="date"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-expected`}>Encaissement prévu</label>
          <input
            id={`${fieldId}-expected`}
            name="expectedPaymentDate"
            type="date"
            value={expectedPaymentDate}
            onChange={(event) => setExpectedPaymentDate(event.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-amount`}>Montant HT</label>
          <input
            id={`${fieldId}-amount`}
            name="amountHt"
            inputMode="decimal"
            value={amountHt}
            onChange={(event) => setAmountHt(event.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-vat`}>TVA</label>
          <input
            id={`${fieldId}-vat`}
            name="vat"
            inputMode="decimal"
            value={vat}
            onChange={(event) => setVat(event.target.value)}
            required
          />
        </div>
      </div>
      <p className="form-hint">Montants en euros, calculés et enregistrés en centimes exacts.</p>
      {state.message ? <p role={state.success ? "status" : "alert"}>{state.message}</p> : null}
      <button type="submit" disabled={pending || customers.length === 0}>
        Créer la facture
      </button>
    </form>
  );
}
