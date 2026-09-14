"use client";

import { formatMoney, formatShortLocalDate, moneyCents, type LocalDate } from "@fc/shared";
import {
  Area,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
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
  const selectedScenario = scenarioCopy[scenario];
  const scenarioSummary = chart.riskDate === null
    ? `reste au-dessus du seuil sur ${horizonDays} jours.`
    : `passe sous le seuil de sécurité le ${formatShortLocalDate(chart.riskDate)}.`;

  return (
    <section className="dashboard-panel cashflow-chart-panel" aria-labelledby="cashflow-chart-title">
      <header className="chart-heading">
        <h2 id="cashflow-chart-title">Solde projeté</h2>
        <ul className="chart-legend" aria-label="Légende du graphique">
          <li><span className="legend-line legend-certain" />{scenarioCopy.certain.label}</li>
          <li><span className="legend-line legend-committed" />{scenarioCopy.committed.label}</li>
          <li><span className="legend-swatch" />{scenarioCopy.probable.label}</li>
          <li><span className="legend-line legend-threshold" />Seuil de sécurité</li>
        </ul>
      </header>
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
          <ComposedChart data={chart.points} margin={{ top: 18, right: 12, bottom: 4, left: 6 }}>
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
