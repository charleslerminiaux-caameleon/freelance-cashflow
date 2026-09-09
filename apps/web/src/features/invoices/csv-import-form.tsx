"use client";

import { useActionState, useId } from "react";

import type { InvoiceFormAction } from "./invoice-form";

const initialState = { message: null, success: false };

export function CsvImportForm({ action }: { action: InvoiceFormAction }) {
  const [state, submit, pending] = useActionState(action, initialState);
  const fieldId = useId();

  return (
    <form action={submit} className="commercial-form">
      <div>
        <label htmlFor={`${fieldId}-csv`}>Fichier CSV</label>
        <input
          id={`${fieldId}-csv`}
          name="csv"
          type="file"
          accept=".csv,text/csv"
          required
        />
      </div>
      <p className="form-hint invoice-csv-columns">
        Colonnes : invoice_number;customer_name;issued_at;due_at;amount_ht;vat;amount_ttc
      </p>
      <p className="form-hint">
        UTF-8, séparateur point-virgule, 1 Mo maximum. Les formules de tableur sont refusées.
      </p>
      {state.message ? <p role={state.success ? "status" : "alert"}>{state.message}</p> : null}
      <button type="submit" disabled={pending}>
        Importer les factures
      </button>
    </form>
  );
}
