"use client";

import { useState, type ReactNode } from "react";
import styles from "./cashflow-chart.module.css";

import { formatMoney, formatShortLocalDate, moneyCents, type LocalDate } from "@fc/shared";
import {
  Area,
  LabelList,
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
import { projectionDates } from "./chart-sampling";
import { scenarioCopy } from "./scenario-copy";

export function formatCashflowChartTick(value: LocalDate): string {
  return formatShortLocalDate(value);
}

export function formatCashflowChartTooltipLabel(value: LocalDate): string {
  return `Date : ${formatShortLocalDate(value)}`;
}

export function CashflowChart({
  chart,
  projectionControls,
  currency,
  horizonDays,
  scenario,
}: Pick<DashboardViewModel, "chart" | "currency" | "horizonDays" | "scenario"> & { projectionControls?: ReactNode }) {
  const [historyDays, setHistoryDays] = useState<0 | 30 | 90>(30);
  const today = chart.points[0]?.date;
  const historyStart = today ? new Date(`${today}T00:00:00Z`) : null;
  historyStart?.setUTCDate(historyStart.getUTCDate() - historyDays);
  const startDate = historyStart?.toISOString().slice(0, 10) ?? "";
  const history = historyDays ? (chart.history?.points ?? []).filter(point => point.date >= startDate) : [];
  const combined = new Map<string, Record<string, string | number>>();
  for (const point of history) combined.set(point.date, { ...point });
  const landmarks = new Set(projectionDates(today, chart.points.at(-1)?.date, horizonDays));
  // Preserve the daily threshold crossing even between calendar landmarks.
  if (chart.riskDate) landmarks.add(chart.riskDate);
  for (const point of chart.points.filter(point => landmarks.has(point.date))) combined.set(point.date, { ...combined.get(point.date), ...point });
  const points: Array<Record<string, string | number> & { date: string; timestamp: number }> = [...combined.values()].sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .map(point => ({ ...point, date: String(point.date), timestamp: Date.parse(`${point.date}T12:00:00Z`) }));
  const tickDates = projectionDates(String(points[0]?.date ?? today ?? ""), chart.points.at(-1)?.date, horizonDays)
    .filter((date, index, dates) => horizonDays === 30
      ? index === 0 || Date.parse(date) - Date.parse(dates[index - 1]!) >= 4 * 86400000
      : date.endsWith("-01"));
  const ticks = tickDates.map(date => Date.parse(`${date}T12:00:00Z`));
  let previousLabel = 0;
  const labeledPoints = points.map(point => {
    const showLabel = landmarks.has(point.date) && point.date !== today
      && point.timestamp - previousLabel >= (horizonDays === 30 ? 5 : 15) * 86400000;
    if (showLabel) previousLabel = point.timestamp;
    return { ...point, certainLabelCents: showLabel ? point.certainBalanceCents : undefined };
  });
  const dateFromTimestamp = (value: number) => new Date(value).toISOString().slice(0, 10) as LocalDate;
  const selectedScenario = scenarioCopy[scenario];
  const scenarioSummary = chart.riskDate === null
    ? `reste au-dessus du seuil sur ${horizonDays} jours.`
    : `passe sous le seuil de sécurité le ${formatShortLocalDate(chart.riskDate)}.`;

  return (
    <section className="dashboard-panel cashflow-chart-panel" aria-labelledby="cashflow-chart-title">
      <header className="chart-heading">
        <h2 id="cashflow-chart-title">Solde projeté</h2>
        <ul className="chart-legend" aria-label="Légende du graphique">
          {history.length > 0 && <li><span className={`legend-line ${styles.actualLegend}`} />Historique</li>}
          <li><span className="legend-line legend-certain" />{scenarioCopy.certain.label}</li>
          <li><span className="legend-line legend-committed" />{scenarioCopy.committed.label}</li>
          <li><span className="legend-swatch" />{scenarioCopy.probable.label}</li>
          <li><span className="legend-line legend-threshold" />Seuil de sécurité</li>
        </ul>
      </header>
      <div className={styles.chartControls}>
        <div className={styles.historyControls} role="group" aria-label="Historique du solde">
          <span>Historique</span>
          {([0, 30, 90] as const).map(days => <button key={days} type="button" aria-pressed={historyDays === days} onClick={() => setHistoryDays(days)}>{days === 0 ? "Masqué" : `${days} jours`}</button>)}
        </div>
        {projectionControls && <div className={styles.projectionControls}>
          <span>Projection</span>
          {projectionControls}
        </div>}
      </div>
      {historyDays > 0 && history.length === 0 && <p className={styles.historyCaption} aria-live="polite">
        Historique indisponible sur cette période.
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
          <ComposedChart data={labeledPoints} margin={{ top: 28, right: 35, bottom: 4, left: 12 }}>
            <CartesianGrid stroke="#e3ebe8" vertical={false} />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              axisLine={false}
              tickLine={false}
              minTickGap={36}
              tickFormatter={(value: number) => horizonDays === 30 ? formatCashflowChartTick(dateFromTimestamp(value)) : new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" }).format(value)}
            />
            <YAxis
              width={60}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => `${Math.round(value / 100_000)} k€`}
            />
            <Tooltip
              labelFormatter={(value) => formatCashflowChartTooltipLabel(dateFromTimestamp(Number(value)))}
              formatter={(value, name) => [
                formatMoney(moneyCents(Number(value))),
                String(name),
              ]}
            />
            {history.length > 0 && <Line type="linear" dataKey="actualBalanceCents" name="Historique" stroke="#475569" strokeWidth={2} dot={false} connectNulls={false} />}
            {history.length > 0 && today && <ReferenceLine x={Date.parse(`${today}T12:00:00Z`)} stroke="#64748b" strokeDasharray="3 4" label={{ value: "Aujourd’hui", position: "insideTopRight", fontSize: 11 }} />}
            <Area
              type="linear"
              dataKey="probableBalanceCents"
              name={scenarioCopy.probable.label}
              fill="#dbe9d1"
              fillOpacity={0.18}
              dot={{ r: 3, fill: "white", strokeWidth: 1.5 }}
              stroke="#78a964"
              strokeDasharray="5 4"
            />
            <Line
              type="linear"
              dataKey="committedBalanceCents"
              name={scenarioCopy.committed.label}
              stroke="#70a08f"
              strokeDasharray="7 4"
              strokeWidth={2}
              dot={{ r: 3, fill: "white", strokeWidth: 1.5 }}
            />
            <Line
              type="linear"
              dataKey="certainBalanceCents"
              name={scenarioCopy.certain.label}
              stroke="#0e6259"
              strokeWidth={2}
              dot={{ r: 4, fill: "white", strokeWidth: 2 }}
            >
              <LabelList dataKey="certainLabelCents" position="top" offset={12} fontSize={11} fill="#53635e" formatter={(value: unknown) => value == null ? "" : formatMoney(moneyCents(Number(value)))} />
            </Line>
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
