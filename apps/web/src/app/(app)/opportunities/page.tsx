import { formatMoney, moneyCents } from "@fc/shared";

import { CustomerDeleteForm, CustomerForm } from "@/features/customers/customer-form";
import {
  createCustomerAction,
  deleteCustomerAction,
  updateCustomerAction,
} from "@/features/customers/actions";
import { listCustomers } from "@/features/customers/repository";
import { getOwnerBusinessDate } from "@/features/invoices/business-date";
import {
  convertOpportunityAction,
  createOpportunityAction,
  deleteOpportunityAction,
  updateOpportunityAction,
} from "@/features/opportunities/actions";
import {
  ConversionForm,
  DeleteOpportunityForm,
  OpportunityForm,
} from "@/features/opportunities/opportunity-form";
import { listOpportunities } from "@/features/opportunities/repository";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

const statusLabels = {
  lead: "Piste",
  qualified: "Qualifiée",
  proposal: "Proposition",
  won: "Gagnée",
  lost: "Perdue",
} as const;

function centsToInput(value: number): string {
  return `${Math.trunc(value / 100)},${(value % 100).toString().padStart(2, "0")}`;
}

function basisPointsToInput(value: number): string {
  const decimals = value % 100;
  return decimals === 0
    ? Math.trunc(value / 100).toString()
    : `${Math.trunc(value / 100)},${decimals.toString().padStart(2, "0")}`;
}

function displayDate(value: string | null): string {
  return value ?? "Non définie";
}

export default async function OpportunitiesPage() {
  const { userId } = await requireOwner();
  const client = await createClient();
  const [customers, opportunities, today] = await Promise.all([
    listCustomers(client, userId),
    listOpportunities(client, userId),
    getOwnerBusinessDate(client, userId),
  ]);

  return (
    <div className="commercial-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Pipeline commercial</p>
          <h1>Opportunités</h1>
          <p>Suivez les missions potentielles, puis transformez-les en commandes signées.</p>
        </div>
        <span className="count-badge">{opportunities.length} opportunité{opportunities.length === 1 ? "" : "s"}</span>
      </header>

      <div className="commercial-layout">
        <aside className="commercial-sidebar">
          <details className="panel" open={customers.length === 0}>
            <summary>Nouveau client</summary>
            <CustomerForm action={createCustomerAction} />
          </details>

          <section className="panel" aria-labelledby="customers-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Répertoire</p>
                <h2 id="customers-title">Clients</h2>
              </div>
              <span>{customers.length}</span>
            </div>
            {customers.length === 0 ? (
              <p className="muted-copy">Créez d’abord un client réel pour ouvrir une opportunité.</p>
            ) : (
              <div className="customer-list">
                {customers.map((customer) => (
                  <details key={customer.id} className="inline-details">
                    <summary>
                      <strong>{customer.name}</strong>
                      <span>{customer.payment_terms_days} j</span>
                    </summary>
                    <CustomerForm
                      action={updateCustomerAction}
                      value={{
                        id: customer.id,
                        name: customer.name,
                        email: customer.email ?? "",
                        paymentTermsDays: customer.payment_terms_days,
                        notes: customer.notes ?? "",
                      }}
                    />
                    <CustomerDeleteForm
                      action={deleteCustomerAction}
                      customerId={customer.id}
                      customerName={customer.name}
                    />
                  </details>
                ))}
              </div>
            )}
          </section>
        </aside>

        <div className="commercial-main">
          <details className="panel" open={opportunities.length === 0 && customers.length > 0}>
            <summary>Nouvelle opportunité</summary>
            {customers.length === 0 ? (
              <p className="muted-copy">Ajoutez un client avant de saisir une opportunité.</p>
            ) : (
              <OpportunityForm
                action={createOpportunityAction}
                customers={customers.map(({ id, name }) => ({ id, name }))}
              />
            )}
          </details>

          {opportunities.length === 0 ? (
            <section className="empty-state commercial-empty" aria-labelledby="empty-opportunities-title">
              <p className="eyebrow">Aucune donnée fictive</p>
              <h2 id="empty-opportunities-title">Votre pipeline est vide</h2>
              <p>Les opportunités saisies apparaîtront ici avec leur montant, probabilité et date prévue.</p>
            </section>
          ) : (
            <div className="record-list">
              {opportunities.map((opportunity) => (
                <article key={opportunity.id} className="record-card">
                  <header>
                    <div>
                      <span className={`status-pill status-${opportunity.status}`}>
                        {statusLabels[opportunity.status]}
                      </span>
                      <h2>{opportunity.name}</h2>
                      <p>{opportunity.customer.name}</p>
                    </div>
                    <strong className="money-value">
                      {formatMoney(moneyCents(opportunity.estimated_amount_ht_cents))} HT
                    </strong>
                  </header>
                  <dl className="record-metrics">
                    <div>
                      <dt>Probabilité</dt>
                      <dd>{basisPointsToInput(opportunity.probability_basis_points)} %</dd>
                    </div>
                    <div>
                      <dt>Clôture prévue</dt>
                      <dd>{displayDate(opportunity.expected_close_date)}</dd>
                    </div>
                    <div>
                      <dt>Période</dt>
                      <dd>
                        {displayDate(opportunity.expected_start_date)} — {displayDate(opportunity.expected_end_date)}
                      </dd>
                    </div>
                  </dl>

                  <div className="record-actions">
                    {opportunity.converted_engagement_id === null && opportunity.status !== "won" ? (
                      <>
                        <div className="record-mutation-controls">
                          <details className="inline-details">
                            <summary>Modifier</summary>
                            <OpportunityForm
                              action={updateOpportunityAction}
                              customers={customers.map(({ id, name }) => ({ id, name }))}
                              value={{
                                id: opportunity.id,
                                customerId: opportunity.customer_id,
                                name: opportunity.name,
                                status: opportunity.status,
                                estimatedAmountHt: centsToInput(opportunity.estimated_amount_ht_cents),
                                probabilityPercent: basisPointsToInput(opportunity.probability_basis_points),
                                expectedCloseDate: opportunity.expected_close_date ?? "",
                                expectedStartDate: opportunity.expected_start_date ?? "",
                                expectedEndDate: opportunity.expected_end_date ?? "",
                                notes: opportunity.notes ?? "",
                              }}
                            />
                          </details>
                          <DeleteOpportunityForm
                            action={deleteOpportunityAction}
                            opportunityId={opportunity.id}
                            opportunityName={opportunity.name}
                          />
                        </div>
                        <ConversionForm
                          action={convertOpportunityAction}
                          opportunityId={opportunity.id}
                          opportunityName={opportunity.name}
                          paymentTermsDays={opportunity.customer.payment_terms_days}
                          status={opportunity.status}
                          today={today}
                          convertedEngagementId={opportunity.converted_engagement_id}
                        />
                      </>
                    ) : (
                      <p className="muted-copy">Cette opportunité est verrouillée après conversion.</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
