import { localDate, moneyCents, type LocalDate, type MoneyCents } from "@fc/shared";

import type { CashflowEvent, ForecastScenario } from "./cashflow-event";
import { generateOccurrences, type RecurrenceFrequency } from "./recurrence";

type Direction = CashflowEvent["direction"];
type CashflowKind = "income" | "expense" | "remuneration" | "reserve";

export type InvoiceForecastSource = {
  id: string;
  billingScheduleItemId: string | null;
  label: string;
  expectedPaymentDate: LocalDate;
  amountTtcCents: MoneyCents;
  paidAmountCents: MoneyCents;
  status: "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "cancelled";
};

export type BillingScheduleForecastSource = {
  id: string;
  label: string;
  expectedPaymentDate: LocalDate;
  amountTtcCents: MoneyCents;
  status: "planned" | "invoiced" | "cancelled";
  engagementStatus: "draft" | "active" | "completed" | "cancelled";
};

export type OpportunityForecastSource = {
  id: string;
  label: string;
  expectedCloseDate: LocalDate | null;
  estimatedAmountHtCents: MoneyCents;
  probabilityBasisPoints: number;
  status: "lead" | "qualified" | "proposal" | "won" | "lost";
  convertedEngagementId: string | null;
};

export type RecurringForecastSource = {
  id: string;
  direction: Direction;
  cashflowKind: CashflowKind;
  label: string;
  amountCents: MoneyCents;
  frequency: RecurrenceFrequency;
  dayOfMonth: number;
  startDate: LocalDate;
  endDate: LocalDate | null;
  certainty: ForecastScenario;
  probabilityBasisPoints: number;
  active: boolean;
};

export type PlannedForecastSource = {
  id: string;
  direction: Direction;
  cashflowKind: CashflowKind;
  label: string;
  amountCents: MoneyCents;
  plannedDate: LocalDate;
  certainty: ForecastScenario;
  probabilityBasisPoints: number;
  status: "planned" | "realized" | "cancelled";
};

export type CashflowSnapshot = {
  invoices: InvoiceForecastSource[];
  billingScheduleItems: BillingScheduleForecastSource[];
  opportunities: OpportunityForecastSource[];
  recurringCashflows: RecurringForecastSource[];
  plannedCashflows: PlannedForecastSource[];
};

export type CashflowEventRange = {
  startDate: LocalDate;
  endDate: LocalDate;
};

function inRange(date: LocalDate, range: CashflowEventRange): boolean {
  return date >= range.startDate && date <= range.endDate;
}

function nonNegativeAmount(value: MoneyCents): MoneyCents {
  const checked = moneyCents(value);
  if (checked < 0) throw new Error("Forecast source amount must not be negative");
  return checked;
}

function basisPoints(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
    throw new Error("Probability must be integer basis points between 0 and 10000");
  }
  return value;
}

function eventProbability(certainty: ForecastScenario, probability: number): number {
  return certainty === "probable" ? basisPoints(probability) : 10_000;
}

function eventSourceType(
  kind: CashflowKind,
  origin: "recurring_cashflow" | "planned_cashflow",
): CashflowEvent["sourceType"] {
  if (kind === "remuneration" || kind === "reserve") return kind;
  return origin;
}

function sourceEventId(
  sourceType: string,
  sourceId: string,
  date: LocalDate,
): string {
  return `${sourceType}:${sourceId}:${date}`;
}

function cashflowSourceEventId(
  origin: "recurring_cashflow" | "planned_cashflow",
  sourceType: CashflowEvent["sourceType"],
  sourceId: string,
  date: LocalDate,
): string {
  const namespace = sourceType === origin ? sourceType : `${origin}:${sourceType}`;
  return sourceEventId(namespace, sourceId, date);
}

export function buildCashflowEvents(
  snapshot: CashflowSnapshot,
  inputRange: CashflowEventRange,
): CashflowEvent[] {
  const range = {
    startDate: localDate(inputRange.startDate),
    endDate: localDate(inputRange.endDate),
  };
  if (range.endDate < range.startDate) {
    throw new Error("Cashflow event range must not be inverted");
  }

  const events = new Map<string, CashflowEvent>();
  const add = (event: CashflowEvent) => {
    if (!events.has(event.id)) events.set(event.id, event);
  };
  const linkedScheduleIds = new Set(
    snapshot.invoices.flatMap((invoice) =>
      invoice.billingScheduleItemId === null ? [] : [invoice.billingScheduleItemId],
    ),
  );

  for (const invoice of snapshot.invoices) {
    if (!["issued", "partially_paid", "overdue"].includes(invoice.status)) continue;
    const plannedDate = localDate(invoice.expectedPaymentDate);
    if (!inRange(plannedDate, range)) continue;

    const total = nonNegativeAmount(invoice.amountTtcCents);
    const paid = moneyCents(invoice.paidAmountCents);
    if (paid < 0 || paid > total) throw new Error("Invoice paid amount must be within its total");
    if (total === 0 || paid === total) continue;

    const id = sourceEventId("invoice", invoice.id, plannedDate);
    add({
      id,
      direction: "inflow",
      sourceType: "invoice",
      sourceId: invoice.id,
      label: invoice.label,
      amountCents: moneyCents(total - paid),
      plannedDate,
      certainty: "certain",
      probabilityBasisPoints: 10_000,
      isActual: false,
    });
  }

  for (const schedule of snapshot.billingScheduleItems) {
    if (schedule.status !== "planned") continue;
    if (schedule.engagementStatus !== "active" && schedule.engagementStatus !== "completed") continue;
    if (linkedScheduleIds.has(schedule.id)) continue;
    const plannedDate = localDate(schedule.expectedPaymentDate);
    if (!inRange(plannedDate, range)) continue;
    const amountCents = nonNegativeAmount(schedule.amountTtcCents);
    if (amountCents === 0) continue;

    const id = sourceEventId("billing_schedule", schedule.id, plannedDate);
    add({
      id,
      direction: "inflow",
      sourceType: "billing_schedule",
      sourceId: schedule.id,
      label: schedule.label,
      amountCents,
      plannedDate,
      certainty: "committed",
      probabilityBasisPoints: 10_000,
      isActual: false,
    });
  }

  for (const opportunity of snapshot.opportunities) {
    if (opportunity.convertedEngagementId !== null) continue;
    if (opportunity.status === "won" || opportunity.status === "lost") continue;
    if (opportunity.expectedCloseDate === null) continue;
    const plannedDate = localDate(opportunity.expectedCloseDate);
    if (!inRange(plannedDate, range)) continue;
    const amountCents = nonNegativeAmount(opportunity.estimatedAmountHtCents);
    if (amountCents === 0) continue;

    const id = sourceEventId("opportunity", opportunity.id, plannedDate);
    add({
      id,
      direction: "inflow",
      sourceType: "opportunity",
      sourceId: opportunity.id,
      label: opportunity.label,
      amountCents,
      plannedDate,
      certainty: "probable",
      probabilityBasisPoints: basisPoints(opportunity.probabilityBasisPoints),
      isActual: false,
    });
  }

  for (const recurring of snapshot.recurringCashflows) {
    if (!recurring.active) continue;
    const sourceStart = localDate(recurring.startDate);
    const sourceEnd = recurring.endDate === null ? range.endDate : localDate(recurring.endDate);
    if (sourceEnd < range.startDate || sourceStart > range.endDate) continue;
    const expansionEnd = sourceEnd < range.endDate ? sourceEnd : range.endDate;
    const sourceType = eventSourceType(recurring.cashflowKind, "recurring_cashflow");
    const amountCents = nonNegativeAmount(recurring.amountCents);
    if (amountCents === 0) continue;

    for (const plannedDate of generateOccurrences({
      frequency: recurring.frequency,
      dayOfMonth: recurring.dayOfMonth,
      startDate: sourceStart,
      endDate: expansionEnd,
    })) {
      if (!inRange(plannedDate, range)) continue;
      const id = cashflowSourceEventId(
        "recurring_cashflow",
        sourceType,
        recurring.id,
        plannedDate,
      );
      add({
        id,
        direction: recurring.direction,
        sourceType,
        sourceId: recurring.id,
        label: recurring.label,
        amountCents,
        plannedDate,
        certainty: recurring.certainty,
        probabilityBasisPoints: eventProbability(
          recurring.certainty,
          recurring.probabilityBasisPoints,
        ),
        isActual: false,
      });
    }
  }

  for (const planned of snapshot.plannedCashflows) {
    if (planned.status !== "planned") continue;
    const plannedDate = localDate(planned.plannedDate);
    if (!inRange(plannedDate, range)) continue;
    const amountCents = nonNegativeAmount(planned.amountCents);
    if (amountCents === 0) continue;
    const sourceType = eventSourceType(planned.cashflowKind, "planned_cashflow");
    const id = cashflowSourceEventId(
      "planned_cashflow",
      sourceType,
      planned.id,
      plannedDate,
    );
    add({
      id,
      direction: planned.direction,
      sourceType,
      sourceId: planned.id,
      label: planned.label,
      amountCents,
      plannedDate,
      certainty: planned.certainty,
      probabilityBasisPoints: eventProbability(planned.certainty, planned.probabilityBasisPoints),
      isActual: false,
    });
  }

  return [...events.values()].sort(
    (left, right) =>
      left.plannedDate.localeCompare(right.plannedDate) || left.id.localeCompare(right.id),
  );
}
