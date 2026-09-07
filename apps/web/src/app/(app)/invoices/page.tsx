import { localDate } from "@fc/shared";

import { listCustomers } from "@/features/customers/repository";
import {
  createInvoiceAction,
  importInvoiceCsvAction,
} from "@/features/invoices/actions";
import { CsvImportForm } from "@/features/invoices/csv-import-form";
import { InvoiceForm } from "@/features/invoices/invoice-form";
import { InvoiceGroups } from "@/features/invoices/invoice-groups";
import {
  listInvoiceableScheduleItems,
  listInvoices,
} from "@/features/invoices/repository";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

function parisToday() {
  return localDate(
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date()),
  );
}

export default async function InvoicesPage() {
  const { userId } = await requireOwner();
  const client = await createClient();
  const [customers, invoices, scheduleItems] = await Promise.all([
    listCustomers(client, userId),
    listInvoices(client, userId),
    listInvoiceableScheduleItems(client, userId),
  ]);
  const today = parisToday();

  return (
    <div className="commercial-page invoice-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Cycle d’encaissement</p>
          <h1>Facturation</h1>
          <p>Saisissez ou importez vos factures, suivez les échéances et enregistrez les paiements réels.</p>
        </div>
        <span className="count-badge">
          {invoices.length} facture{invoices.length === 1 ? "" : "s"}
        </span>
      </header>

      <div className="invoice-entry-grid">
        <details className="panel" open={invoices.length === 0 && customers.length > 0}>
          <summary>Nouvelle facture manuelle</summary>
          {customers.length === 0 ? (
            <p className="muted-copy">
              Créez d’abord un client depuis les opportunités pour saisir une facture.
            </p>
          ) : (
            <InvoiceForm
              action={createInvoiceAction}
              customers={customers.map(({ id, name }) => ({ id, name }))}
              scheduleItems={scheduleItems.map((item) => ({
                id: item.id,
                label: item.label,
                reference: item.engagement.reference,
                customerId: item.engagement.customer_id,
                customerName: item.engagement.customer.name,
                plannedInvoiceDate: item.planned_invoice_date,
                expectedPaymentDate: item.expected_payment_date,
                amountHtCents: item.amount_ht_cents,
                vatCents: item.vat_cents,
              }))}
              today={today}
            />
          )}
        </details>

        <details className="panel">
          <summary>Importer un CSV</summary>
          <CsvImportForm action={importInvoiceCsvAction} />
        </details>
      </div>

      {invoices.length === 0 && scheduleItems.length === 0 ? (
        <section className="empty-state commercial-empty invoice-empty" aria-labelledby="empty-invoices-title">
          <p className="eyebrow">Aucune donnée fictive</p>
          <h2 id="empty-invoices-title">Aucune facture ni échéance à afficher</h2>
          <p>Les factures saisies et les jalons de commandes apparaîtront dans le pipeline ci-dessous.</p>
        </section>
      ) : null}

      <InvoiceGroups
        today={today}
        scheduleItems={scheduleItems.map((item) => ({
          id: item.id,
          label: item.label,
          reference: item.engagement.reference,
          customerName: item.engagement.customer.name,
          plannedInvoiceDate: item.planned_invoice_date,
          amountTtcCents: item.amount_ttc_cents,
        }))}
        invoices={invoices.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoice_number,
          customerName: invoice.customer.name,
          amountTtcCents: invoice.amount_ttc_cents,
          paidAmountCents: invoice.paid_amount_cents,
          dueAt: invoice.due_at,
          status: invoice.status,
        }))}
      />
    </div>
  );
}
