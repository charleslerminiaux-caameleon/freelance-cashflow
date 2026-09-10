import { formatMoney, moneyCents } from "@fc/shared";

import { scenarioCopy } from "./scenario-copy";
import type { DashboardViewModel } from "./view-model";

export function KpiStrip({
  kpis,
  horizonDays,
  scenario,
  openingBalanceSource = "manual",
  openingBalanceAsOf,
  lastBankSyncSucceeded,
  excludedBankCurrencies = [],
}: Pick<DashboardViewModel, "kpis" | "horizonDays" | "scenario"> & Partial<Pick<DashboardViewModel, "openingBalanceSource" | "openingBalanceAsOf" | "lastBankSyncSucceeded" | "excludedBankCurrencies">>) {
  const reservedCents = moneyCents(kpis.currentBalanceCents - kpis.availableBalanceCents);

  return (
    <section className="dashboard-kpis" aria-label="Indicateurs de trésorerie">
      <article className="dashboard-kpi dashboard-kpi-balance">
        <span>Solde</span>
        <strong>{formatMoney(kpis.currentBalanceCents)}</strong>
        <small>{openingBalanceSource === "qonto" ? "Solde Qonto" : "Solde manuel"}{openingBalanceAsOf ? ` au ${openingBalanceAsOf}` : " actuel"}</small>
        {openingBalanceSource === "qonto" && lastBankSyncSucceeded === false && <small>Actualisation nécessaire · données conservées</small>}
        {excludedBankCurrencies.length > 0 && <small>Devises exclues : {excludedBankCurrencies.join(", ")}</small>}
      </article>
      <article className="dashboard-kpi dashboard-kpi-available">
        <span>Disponible</span>
        <strong>{formatMoney(kpis.availableBalanceCents)}</strong>
        <small>− {formatMoney(reservedCents)} réservés</small>
      </article>
      <article className="dashboard-kpi">
        <span>Entrées 30 j</span>
        <strong className="positive">+{formatMoney(kpis.inflows30DaysCents)}</strong>
        <small>flux inclus dans la projection</small>
      </article>
      <article className="dashboard-kpi">
        <span>Sorties 30 j</span>
        <strong className="negative">−{formatMoney(kpis.outflows30DaysCents)}</strong>
        <small>charges et réserves incluses</small>
      </article>
      <article className="dashboard-kpi">
        <span>Projeté 30 j</span>
        <strong>{formatMoney(kpis.projected30DaysCents)}</strong>
        <small>{scenarioCopy[scenario].label}</small>
      </article>
      <article className="dashboard-kpi dashboard-kpi-runway">
        <span>Runway</span>
        <strong>{kpis.runwayDays === null ? `>${horizonDays} jours` : `${kpis.runwayDays} jours`}</strong>
        <small>avant passage sous le seuil</small>
      </article>
    </section>
  );
}
