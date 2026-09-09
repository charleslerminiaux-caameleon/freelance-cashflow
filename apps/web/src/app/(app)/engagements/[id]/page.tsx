import { formatMoney, moneyCents } from "@fc/shared";
import { notFound } from "next/navigation";
import { z } from "zod";

import { createBillingScheduleItemAction } from "@/features/engagements/actions";
import { BillingScheduleForm } from "@/features/engagements/billing-schedule-form";
import {
  getEngagement,
  listBillingScheduleItems,
} from "@/features/engagements/repository";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

const engagementIdSchema = z.string().uuid();

export default async function EngagementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await requireOwner();
  const parsedId = engagementIdSchema.safeParse((await params).id);

  if (!parsedId.success) {
    notFound();
  }

  const client = await createClient();
  const engagement = await getEngagement(client, userId, parsedId.data);

  if (!engagement) {
    notFound();
  }

  const schedule = await listBillingScheduleItems(client, userId, engagement.id);
  const scheduledTtcCents = schedule
    .filter((item) => item.status !== "cancelled")
    .reduce((sum, item) => sum + item.amount_ttc_cents, 0);
  const remainingTtcCents = engagement.amount_ttc_cents - scheduledTtcCents;

  return (
    <div className="commercial-page">
      <a className="back-link" href="/engagements">← Toutes les commandes</a>
      <header className="page-heading detail-heading">
        <div>
          <p className="eyebrow">Commande · {engagement.status}</p>
          <h1>{engagement.reference}</h1>
          <p>{engagement.customer.name}</p>
        </div>
        <strong className="hero-amount">{formatMoney(moneyCents(engagement.amount_ttc_cents))} TTC</strong>
      </header>

      <section className="contract-grid" aria-label="Valeurs du contrat">
        <div className="metric-card">
          <span>Montant HT</span>
          <strong>{formatMoney(moneyCents(engagement.amount_ht_cents))}</strong>
        </div>
        <div className="metric-card">
          <span>Signée le</span>
          <strong>{engagement.signed_at}</strong>
        </div>
        <div className="metric-card">
          <span>Période</span>
          <strong>{engagement.start_date ?? "Non définie"} — {engagement.end_date ?? "Non définie"}</strong>
        </div>
        <div className="metric-card accent-card">
          <span>Reste à planifier TTC</span>
          <strong>{formatMoney(moneyCents(remainingTtcCents))}</strong>
        </div>
      </section>

      <div className="detail-grid">
        <section className="panel" aria-labelledby="schedule-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Facturation</p>
              <h2 id="schedule-title">Échéancier</h2>
            </div>
            <span>{schedule.length}</span>
          </div>
          {schedule.length === 0 ? (
            <p className="muted-copy">Aucune échéance. Ajoutez un acompte, un jalon ou le solde.</p>
          ) : (
            <div className="schedule-list">
              {schedule.map((item) => (
                <article key={item.id} className="schedule-row">
                  <div>
                    <strong>{item.label}</strong>
                    <span>Facturation {item.planned_invoice_date} · Paiement {item.expected_payment_date}</span>
                  </div>
                  <div>
                    <strong>{formatMoney(moneyCents(item.amount_ttc_cents))}</strong>
                    <span>{item.status}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
          <footer className="schedule-total">
            <span>Total planifié TTC</span>
            <strong>{formatMoney(moneyCents(scheduledTtcCents))}</strong>
          </footer>
        </section>

        <section className="panel" aria-labelledby="new-schedule-title">
          <p className="eyebrow">Nouveau jalon</p>
          <h2 id="new-schedule-title">Ajouter une échéance</h2>
          <BillingScheduleForm
            action={createBillingScheduleItemAction}
            engagementId={engagement.id}
            paymentTermsDays={engagement.payment_terms_days}
          />
        </section>
      </div>
    </div>
  );
}
