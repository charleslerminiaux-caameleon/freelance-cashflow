import { formatMoney } from "@fc/shared";

import { BankingView } from "@/features/banking/banking-view";
import { getBankingSnapshot, parseBankPage } from "@/features/banking/repository";
import { getOwnerSettings } from "@/features/settings/repository";
import { recurringHistoryWindow } from "@/features/recurring-detection/history-window";
import { businessDateForTimezone } from "@/features/dashboard/query";
import { createClient } from "@/lib/supabase/server";
import { HorizonSelector } from "@/features/dashboard/horizon-selector";
import {
  getDashboardViewModel,
  type DashboardSearchParameters,
} from "@/features/dashboard/query";
import { requireOwner } from "@/lib/auth/require-owner";

const sourceLabels = {
  invoice: "Facture",
  billing_schedule: "Commande signée",
  opportunity: "Opportunité",
  recurring_cashflow: "Charge récurrente",
  planned_cashflow: "Flux ponctuel",
  remuneration: "Rémunération",
  reserve: "Réserve",
} as const;

const certaintyLabels = {
  certain: "Certain",
  committed: "Engagé",
  probable: "Probable pondéré",
} as const;

export default async function CashflowPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParameters>;
}) {
  const [{ userId }, parameters] = await Promise.all([requireOwner(), searchParams]);
  const client = await createClient();
  const settings = await getOwnerSettings(client, userId);
  const today = businessDateForTimezone(settings.timezone);
  const banking = await getBankingSnapshot(client, userId, {
    historyPage: parseBankPage(parameters.bankPage),
    fullHistory: recurringHistoryWindow(today),
  });
  const model = await getDashboardViewModel(userId, {
    searchParameters: parameters,
    today,
    bankingSnapshot: banking,
  });

  return (
    <div className="commercial-page cashflow-page">
      <header className="page-heading cashflow-heading">
        <div>
          <p className="eyebrow">Projection explicable</p>
          <h1>Trésorerie</h1>
          <p>Chaque variation relie une source métier à son effet sur le solde prévisionnel.</p>
        </div>
        <HorizonSelector
          basePath="/cashflow"
          horizonDays={model.horizonDays}
          scenario={model.scenario}
          inclusions={model.inclusions}
        />
      </header>

      <section className="cashflow-opening" aria-label="Point de départ de la projection">
        <div>
          <span>Solde d’ouverture</span>
          <strong>{formatMoney(model.openingBalanceCents)}</strong>
        </div>
        <p>
          {model.openingBalanceSource === "qonto" ? "Situation Qonto" : model.openingBalanceSource === "banking" ? "Situation bancaire" : "Situation manuelle"} au {model.openingBalanceAsOf} · seuil de sécurité {formatMoney(model.safetyThresholdCents)}
        </p>
        {model.openingBalanceSource !== "manual" && model.lastBankSyncSucceeded === false && <p>Actualisation nécessaire · dernier solde publié conservé.</p>}
        {model.excludedBankCurrencies.length > 0 && <p>Devises exclues : {model.excludedBankCurrencies.join(", ")}.</p>}
      </section>

      <section className="dashboard-panel treasury-panel" aria-labelledby="treasury-events-title">
        <header className="dashboard-panel-heading">
          <div>
            <p className="eyebrow">Scénario {certaintyLabels[model.scenario].toLowerCase()}</p>
            <h2 id="treasury-events-title">Événements prévisionnels</h2>
          </div>
          <span>{model.treasuryEvents.length}</span>
        </header>
        <div className="treasury-table-wrap">
          <table className="treasury-table" aria-label="Événements de trésorerie">
            <thead>
              <tr>
                <th scope="col">Date prévue</th>
                <th scope="col">Source</th>
                <th scope="col">Libellé</th>
                <th scope="col">Certitude</th>
                <th scope="col">Montant</th>
                <th scope="col">Solde courant</th>
              </tr>
            </thead>
            <tbody>
              {model.treasuryEvents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="treasury-empty">Aucun événement inclus sur cet horizon.</td>
                </tr>
              ) : model.treasuryEvents.map((event) => (
                <tr key={event.id}>
                  <td data-label="Date prévue">{event.plannedDate}</td>
                  <td data-label="Source">{sourceLabels[event.sourceType]}</td>
                  <th scope="row" data-label="Libellé">{event.label}</th>
                  <td data-label="Certitude">
                    <span className={`certainty-pill certainty-${event.certainty}`}>
                      {certaintyLabels[event.certainty]}
                    </span>
                  </td>
                  <td
                    data-label="Montant"
                    className={event.direction === "inflow" ? "positive" : "negative"}
                  >
                    {event.direction === "inflow" ? "+" : "−"}{formatMoney(event.amountCents)}
                  </td>
                  <td data-label="Solde courant"><strong>{formatMoney(event.runningBalanceCents)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <BankingView banking={banking} history={banking.history} currency={model.currency} searchParameters={parameters} />
    </div>
  );
}
