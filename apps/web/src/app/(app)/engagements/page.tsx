import { formatMoney, moneyCents } from "@fc/shared";

import { listEngagements } from "@/features/engagements/repository";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

const statusLabels = {
  draft: "Brouillon",
  active: "Active",
  completed: "Terminée",
  cancelled: "Annulée",
} as const;

export default async function EngagementsPage() {
  const { userId } = await requireOwner();
  const client = await createClient();
  const engagements = await listEngagements(client, userId);

  return (
    <div className="commercial-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Activité signée</p>
          <h1>Commandes</h1>
          <p>Retrouvez les engagements issus de votre pipeline et préparez leur facturation.</p>
        </div>
        <span className="count-badge">{engagements.length} commande{engagements.length === 1 ? "" : "s"}</span>
      </header>

      {engagements.length === 0 ? (
        <section className="empty-state commercial-empty" aria-labelledby="empty-engagements-title">
          <p className="eyebrow">Aucune commande</p>
          <h2 id="empty-engagements-title">Convertissez votre première opportunité</h2>
          <p>Une commande apparaîtra ici après une conversion réussie et unique.</p>
          <a className="primary-link" href="/opportunities">Ouvrir les opportunités</a>
        </section>
      ) : (
        <div className="record-list engagement-grid">
          {engagements.map((engagement) => (
            <a key={engagement.id} href={`/engagements/${engagement.id}`} className="record-card linked-card">
              <header>
                <div>
                  <span className={`status-pill status-${engagement.status}`}>
                    {statusLabels[engagement.status]}
                  </span>
                  <h2>{engagement.reference}</h2>
                  <p>{engagement.customer.name}</p>
                </div>
                <strong className="money-value">
                  {formatMoney(moneyCents(engagement.amount_ttc_cents))} TTC
                </strong>
              </header>
              <dl className="record-metrics">
                <div>
                  <dt>Signée le</dt>
                  <dd>{engagement.signed_at}</dd>
                </div>
                <div>
                  <dt>Montant HT</dt>
                  <dd>{formatMoney(moneyCents(engagement.amount_ht_cents))}</dd>
                </div>
                <div>
                  <dt>Paiement</dt>
                  <dd>{engagement.payment_terms_days} jours</dd>
                </div>
              </dl>
              <span className="text-link">Voir la commande et son plan de facturation →</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
