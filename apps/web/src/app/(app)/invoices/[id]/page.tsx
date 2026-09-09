import { deriveInvoiceStatus } from "@fc/domain";
import { formatMoney, moneyCents } from "@fc/shared";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { z } from "zod";

import { recordInvoicePaymentAction } from "@/features/invoices/actions";
import { getOwnerBusinessDate } from "@/features/invoices/business-date";
import { PaymentForm } from "@/features/invoices/payment-form";
import {
  getInvoice,
  listInvoicePayments,
} from "@/features/invoices/repository";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

const invoiceIdSchema = z.string().uuid();

const statusLabels = {
  draft: "Brouillon",
  issued: "Facturée",
  partially_paid: "Partiellement encaissée",
  paid: "Payée",
  overdue: "En retard",
  cancelled: "Annulée",
} as const;

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await requireOwner();
  const parsedId = invoiceIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();

  const client = await createClient();
  const invoice = await getInvoice(client, userId, parsedId.data);
  if (!invoice) notFound();

  const [payments, today] = await Promise.all([
    listInvoicePayments(client, userId, invoice.id),
    getOwnerBusinessDate(client, userId),
  ]);
  const currentStatus =
    invoice.status === "draft"
      ? "draft"
      : deriveInvoiceStatus({
          cancelled: invoice.status === "cancelled",
          amountTtcCents: moneyCents(invoice.amount_ttc_cents),
          paidAmountCents: moneyCents(invoice.paid_amount_cents),
          dueAt: invoice.due_at,
          today,
        });
  const remainingCents = invoice.amount_ttc_cents - invoice.paid_amount_cents;
  const canPay =
    remainingCents > 0 && currentStatus !== "draft" && currentStatus !== "cancelled";

  return (
    <div className="commercial-page invoice-page">
      <a className="back-link" href="/invoices">← Toutes les factures</a>
      <header className="page-heading detail-heading">
        <div>
          <p className="eyebrow">Facture · {statusLabels[currentStatus]}</p>
          <h1>{invoice.invoice_number}</h1>
          <p>{invoice.customer.name}</p>
        </div>
        <strong className="hero-amount">
          {formatMoney(moneyCents(invoice.amount_ttc_cents))} TTC
        </strong>
      </header>

      <section className="contract-grid" aria-label="Valeurs de la facture">
        <div className="metric-card">
          <span>Montant HT</span>
          <strong>{formatMoney(moneyCents(invoice.amount_ht_cents))}</strong>
        </div>
        <div className="metric-card">
          <span>TVA</span>
          <strong>{formatMoney(moneyCents(invoice.vat_cents))}</strong>
        </div>
        <div className="metric-card">
          <span>Émise / échéance</span>
          <strong>{invoice.issued_at} / {invoice.due_at}</strong>
        </div>
        <div className="metric-card accent-card">
          <span>Reste à encaisser</span>
          <strong>{formatMoney(moneyCents(remainingCents))}</strong>
        </div>
      </section>

      <div className="detail-grid">
        <section className="panel" aria-labelledby="payments-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Historique</p>
              <h2 id="payments-title">Paiements</h2>
            </div>
            <span>{payments.length}</span>
          </div>
          {payments.length === 0 ? (
            <p className="muted-copy">Aucun paiement enregistré pour cette facture.</p>
          ) : (
            <div className="invoice-group-list">
              {payments.map((payment) => (
                <article className="invoice-row" key={payment.id}>
                  <span>
                    <strong>Paiement manuel</strong>
                    <small>{payment.paid_at}</small>
                  </span>
                  <strong>{formatMoney(moneyCents(payment.amount_cents))}</strong>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="new-payment-title">
          <p className="eyebrow">Encaissement</p>
          <h2 id="new-payment-title">Enregistrer un paiement</h2>
          {canPay ? (
            <PaymentForm
              action={recordInvoicePaymentAction}
              invoiceId={invoice.id}
              initialIdempotencyKey={randomUUID()}
              remainingCents={remainingCents}
              today={today}
            />
          ) : (
            <p className="muted-copy">
              {currentStatus === "paid"
                ? `Facture soldée le ${invoice.paid_at ?? "—"}.`
                : "Cette facture ne peut pas recevoir de paiement."}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
