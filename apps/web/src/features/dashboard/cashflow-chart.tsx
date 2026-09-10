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

export function formatCashflowChartTick(value: LocalDate): string {
  return formatShortLocalDate(value);
}

export function formatCashflowChartTooltipLabel(value: LocalDate): string {
  return `Date : ${formatShortLocalDate(value)}`;
}

export function CashflowChart({
  chart,
  currency,
}: Pick<DashboardViewModel, "chart" | "currency">) {
  return (
    <section className="dashboard-panel cashflow-chart-panel" aria-labelledby="cashflow-chart-title">
      <header className="chart-heading">
        <h2 id="cashflow-chart-title">Solde projeté</h2>
        <ul className="chart-legend" aria-label="Légende du graphique">
          <li><span className="legend-line legend-certain" />Certain</li>
          <li><span className="legend-line legend-committed" />Engagé</li>
          <li><span className="legend-swatch" />Probable pondéré</li>
          <li><span className="legend-line legend-threshold" />Seuil de sécurité</li>
        </ul>
      </header>
      <p id="cashflow-chart-summary" className="sr-only">{chart.summary}</p>
      <div
        className="cashflow-chart"
        role="img"
        aria-label="Projection de trésorerie"
        aria-describedby="cashflow-chart-summary"
        data-currency={currency}
      >
        <ResponsiveContainer width="100%" height={340}>
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
              name="Probable pondéré"
              fill="#dbe9d1"
              fillOpacity={0.72}
              stroke="#78a964"
              strokeDasharray="5 4"
            />
            <Line
              type="monotone"
              dataKey="committedBalanceCents"
              name="Engagé"
              stroke="#70a08f"
              strokeDasharray="7 4"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="certainBalanceCents"
              name="Certain"
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
        {chart.summary}
      </p>
    </section>
  );
}
