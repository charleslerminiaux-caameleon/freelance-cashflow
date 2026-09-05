import type { LocalDate, MoneyCents } from "@fc/shared";

export type ForecastScenario = "certain" | "committed" | "probable";

export type CashflowEvent = {
  id: string;
  direction: "inflow" | "outflow";
  sourceType:
    | "invoice"
    | "billing_schedule"
    | "opportunity"
    | "recurring_cashflow"
    | "planned_cashflow"
    | "remuneration"
    | "reserve";
  sourceId: string;
  label: string;
  amountCents: MoneyCents;
  plannedDate: LocalDate;
  certainty: ForecastScenario;
  probabilityBasisPoints: number;
  isActual: boolean;
};
