import { formatMoney, moneyCents } from "@fc/shared";

import { QontoBadge } from "@/features/integrations/qonto-badge";

import { KpiValue } from "./kpi-value";
import { scenarioCopy } from "./scenario-copy";
import type { DashboardViewModel } from "./view-model";

export function KpiStrip({
  kpis,
  timezone = "Europe/Paris",
  bankSyncInProgress = false,
  horizonDays,
  scenario,
  openingBalanceSource = "manual",
  openingBalanceAsOf,
  lastBankSyncSucceeded,
  excludedBankCurrencies = [],
}: Pick<DashboardViewModel, "kpis" | "horizonDays" | "scenario"> & Partial<Pick<DashboardViewModel, "openingBalanceSource" | "openingBalanceAsOf" | "lastBankSyncSucceeded" | "excludedBankCurrencies" | "timezone" | "bankSyncInProgress">>) {
  // A manual balance date is a business day, not an instant in the owner timezone.
  const manualDate = openingBalanceAsOf && openingBalanceSource === "manual"
    ? new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" })
      .format(new Date(`${openingBalanceAsOf}T12:00:00Z`)) : null;
  const reservedCents = moneyCents(kpis.currentBalanceCents - kpis.availableBalanceCents);

  return (
    <section className="dashboard-kpis" aria-label="Indicateurs de trésorerie">
      <article className="dashboard-kpi dashboard-kpi-balance">
        <span>Solde</span>
        <KpiValue>{formatMoney(kpis.currentBalanceCents)}</KpiValue>
        {openingBalanceSource === "qonto" ? (
          <QontoBadge lastSuccessAt={openingBalanceAsOf ?? null} timezone={timezone}
            lastAttemptFailed={lastBankSyncSucceeded === false} syncInProgress={bankSyncInProgress} />
        ) : openingBalanceSource === "banking" ? <small>Solde bancaire · publication la plus ancienne : {openingBalanceAsOf}{bankSyncInProgress ? " · synchronisation en cours" : ""}</small> : <small>Solde manuel{manualDate ? ` au ${manualDate}` : " actuel"}</small>}
        {openingBalanceSource !== "manual" && lastBankSyncSucceeded === false && <small>Actualisation nécessaire · données conservées</small>}
        {excludedBankCurrencies.length > 0 && <small>Devises exclues : {excludedBankCurrencies.join(", ")}</small>}
      </article>
      <article className="dashboard-kpi dashboard-kpi-available">
        <span>Disponible</span>
        <KpiValue>{formatMoney(kpis.availableBalanceCents)}</KpiValue>
        <small className="kpi-caption">{formatMoney(reservedCents)} réservés</small>
      </article>
      <article className="dashboard-kpi">
        <span>Entrées 30 j</span>
        <KpiValue className="positive">{`+${formatMoney(kpis.inflows30DaysCents)}`}</KpiValue>
        <small className="kpi-caption">À encaisser</small>
      </article>
      <article className="dashboard-kpi">
        <span>Sorties 30 j</span>
        <KpiValue className="negative">{`−${formatMoney(kpis.outflows30DaysCents)}`}</KpiValue>
        <small className="kpi-caption">Charges et réserves</small>
      </article>
      <article className="dashboard-kpi">
        <span>Projeté 30 j</span>
        <KpiValue>{formatMoney(kpis.projected30DaysCents)}</KpiValue>
        <small className="kpi-caption">{scenarioCopy[scenario].label}</small>
      </article>
      <article className="dashboard-kpi dashboard-kpi-runway">
        <span>Runway</span>
        <KpiValue>{kpis.runwayDays === null ? `>${horizonDays} jours` : `${kpis.runwayDays} jours`}</KpiValue>
        <small className="kpi-caption">Avant le seuil</small>
      </article>
    </section>
  );
}
