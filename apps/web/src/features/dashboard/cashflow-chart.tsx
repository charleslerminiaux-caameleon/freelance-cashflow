"use client";

import { useState } from "react";
import styles from "./cashflow-chart.module.css";

import { formatMoney, formatShortLocalDate, moneyCents, type LocalDate } from "@fc/shared";
import {
  Area,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DashboardViewModel } from "./view-model";
import { scenarioCopy } from "./scenario-copy";

export function formatCashflowChartTick(value: LocalDate): string {
  return formatShortLocalDate(value);
}

export function formatCashflowChartTooltipLabel(value: LocalDate): string {
  return `Date : ${formatShortLocalDate(value)}`;
}

export function CashflowChart({
  chart,
  currency,
  horizonDays,
  scenario,
}: Pick<DashboardViewModel, "chart" | "currency" | "horizonDays" | "scenario">) {
  const [historyDays, setHistoryDays] = useState<0 | 30 | 90>(30);
  const today = chart.points[0]?.date;
  const historyStart = today ? new Date(`${today}T00:00:00Z`) : null;
  historyStart?.setUTCDate(historyStart.getUTCDate() - historyDays);
  const startDate = historyStart?.toISOString().slice(0, 10) ?? "";
  const history = historyDays ? (chart.history?.points ?? []).filter(point => point.date >= startDate) : [];
  const combined = new Map<string, Record<string, string | number>>();
  for (const point of history) combined.set(point.date, { ...point });
  for (const point of chart.points) combined.set(point.date, { ...combined.get(point.date), ...point });
  const points = [...combined.values()].sort((left, right) => String(left.date).localeCompare(String(right.date)));
  const selectedScenario = scenarioCopy[scenario];
  const scenarioSummary = chart.riskDate === null
    ? `reste au-dessus du seuil sur ${horizonDays} jours.`
    : `passe sous le seuil de sécurité le ${formatShortLocalDate(chart.riskDate)}.`;

  return (
    <section className="dashboard-panel cashflow-chart-panel" aria-labelledby="cashflow-chart-title">
      <header className="chart-heading">
        <h2 id="cashflow-chart-title">Solde et prévisions</h2>
        <ul className="chart-legend" aria-label="Légende du graphique">
          {history.length > 0 && <li><span className={`legend-line ${styles.actualLegend}`} />Solde bancaire reconstitué</li>}
          <li><span className="legend-line legend-certain" />{scenarioCopy.certain.label}</li>
          <li><span className="legend-line legend-committed" />{scenarioCopy.committed.label}</li>
          <li><span className="legend-swatch" />{scenarioCopy.probable.label}</li>
          <li><span className="legend-line legend-threshold" />Seuil de sécurité</li>
        </ul>
      </header>
      <div className={styles.historyControls} role="group" aria-label="Historique du solde">
        <span>Historique</span>
        {([0, 30, 90] as const).map(days => <button key={days} type="button" aria-pressed={historyDays === days} onClick={() => setHistoryDays(days)}>{days === 0 ? "Masqué" : `${days} jours`}</button>)}
      </div>
      {historyDays > 0 && <p className={styles.historyCaption} aria-live="polite">
        {history.length > 0
          ? `Historique affiché du ${formatShortLocalDate(history[0]!.date)} au ${formatShortLocalDate(history.at(-1)!.date)}. Solde reconstitué à partir des opérations comptabilisées importées ; dernière journée arrêtée à la synchronisation.`
          : "Historique bancaire indisponible sur cette période. Une saisie manuelle du solde ne permet pas de reconstituer le passé."}
      </p>}
      <p id="cashflow-chart-summary" className="sr-only">
        {selectedScenario.label} · {scenarioSummary}
      </p>
      <div
        className="cashflow-chart"
        role="img"
        aria-label="Projection de trésorerie"
        aria-describedby="cashflow-chart-summary"
        data-currency={currency}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 18, right: 12, bottom: 4, left: 6 }}>
            <CartesianGrid stroke="#e3ebe8" vertical={false} />
            <XAxis
              dataKey="date"
              minTickGap={36}
              tickFormatter={(value: string) => formatCashflowChartTick(value as LocalDate)}
            />
            <YAxis
              width={68}
              tickFormatter={(value: number) => `${Math.round(value / 100_000)} k€`}
            />
            <Tooltip
              labelFormatter={(value) => formatCashflowChartTooltipLabel(value as LocalDate)}
              formatter={(value, name) => [
                formatMoney(moneyCents(Number(value))),
                String(name),
              ]}
            />
            {history.length > 0 && <Line type="stepAfter" dataKey="actualBalanceCents" name="Solde bancaire reconstitué" stroke="#475569" strokeWidth={3} dot={false} connectNulls={false} />}
            {history.length > 0 && today && <ReferenceLine x={today} stroke="#64748b" strokeDasharray="3 4" label={{ value: "Aujourd’hui", position: "insideTopRight", fontSize: 11 }} />}
            <Area
              type="monotone"
              dataKey="probableBalanceCents"
              name={scenarioCopy.probable.label}
              fill="#dbe9d1"
              fillOpacity={0.72}
              stroke="#78a964"
              strokeDasharray="5 4"
            />
            <Line
              type="monotone"
              dataKey="committedBalanceCents"
              name={scenarioCopy.committed.label}
              stroke="#70a08f"
              strokeDasharray="7 4"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="certainBalanceCents"
              name={scenarioCopy.certain.label}
              stroke="#0e6259"
              strokeWidth={3}
              dot={false}
            />
            <Line
              type="linear"
              dataKey="safetyThresholdCents"
              name="Seuil de sécurité"
              stroke="#df6c5a"
              strokeDasharray="6 5"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className={chart.riskDate === null ? "chart-risk-safe" : "chart-risk-alert"}>
        <strong>{selectedScenario.label}</strong> · {scenarioSummary}
      </p>
    </section>
  );
}
