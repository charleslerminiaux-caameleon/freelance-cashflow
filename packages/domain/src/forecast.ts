import { localDate, moneyCents } from "@fc/shared";
import type { LocalDate, MoneyCents } from "@fc/shared";

import type { CashflowEvent, ForecastScenario } from "./cashflow-event";

export type ForecastInput = {
  startBalanceCents: MoneyCents;
  startDate: LocalDate;
  endDate: LocalDate;
  safetyThresholdCents: MoneyCents;
  scenario: ForecastScenario;
  events: CashflowEvent[];
};

export type ForecastPoint = {
  date: LocalDate;
  balanceCents: MoneyCents;
  inflowsCents: MoneyCents;
  outflowsCents: MoneyCents;
  events: CashflowEvent[];
};

export type ForecastResult = {
  points: ForecastPoint[];
  lowestBalanceCents: MoneyCents;
  lowestBalanceDate: LocalDate;
  runwayDays: number | null;
};

function dateToUtc(date: LocalDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function nextDate(date: LocalDate): LocalDate {
  const utcDate = dateToUtc(date);
  utcDate.setUTCDate(utcDate.getUTCDate() + 1);
  return localDate(utcDate.toISOString().slice(0, 10));
}

function isIncluded(event: CashflowEvent, scenario: ForecastScenario): boolean {
  if (scenario === "certain") return event.certainty === "certain";
  if (scenario === "committed") return event.certainty !== "probable";
  return true;
}

function eventAmountForScenario(event: CashflowEvent, scenario: ForecastScenario): MoneyCents {
  if (scenario !== "probable" || event.certainty !== "probable") {
    return event.amountCents;
  }

  const amount = BigInt(event.amountCents);
  const sign = amount < 0n ? -1n : 1n;
  const absoluteAmount = amount < 0n ? -amount : amount;
  const numerator = absoluteAmount * BigInt(event.probabilityBasisPoints);
  const quotient = numerator / 10_000n;
  const remainder = numerator % 10_000n;
  const rounded = quotient + (remainder >= 5_000n ? 1n : 0n);
  return moneyCents(Number(sign * rounded));
}

export function calculateForecast(input: ForecastInput): ForecastResult {
  if (input.startDate > input.endDate) {
    throw new Error("startDate must be on or before endDate");
  }

  for (const event of input.events) {
    if (event.amountCents < 0) {
      throw new Error("Event amounts must be non-negative");
    }
    if (
      !Number.isInteger(event.probabilityBasisPoints) ||
      event.probabilityBasisPoints < 0 ||
      event.probabilityBasisPoints > 10_000
    ) {
      throw new Error("Probability basis points must be an integer between 0 and 10000");
    }
  }

  const eventsByDate = new Map<LocalDate, CashflowEvent[]>();
  for (const event of input.events) {
    if (!isIncluded(event, input.scenario)) continue;
    const dateEvents = eventsByDate.get(event.plannedDate) ?? [];
    dateEvents.push(event);
    eventsByDate.set(event.plannedDate, dateEvents);
  }

  const points: ForecastPoint[] = [];
  let balance = input.startBalanceCents;
  let date = input.startDate;

  while (date <= input.endDate) {
    const dateEvents = eventsByDate.get(date) ?? [];
    let inflows = 0;
    let outflows = 0;

    for (const event of dateEvents) {
      const amount = eventAmountForScenario(event, input.scenario);
      if (event.direction === "inflow") {
        inflows += amount;
        balance = moneyCents(balance + amount);
      } else {
        outflows += amount;
        balance = moneyCents(balance - amount);
      }
    }

    points.push({
      date,
      balanceCents: balance,
      inflowsCents: moneyCents(inflows),
      outflowsCents: moneyCents(outflows),
      events: dateEvents,
    });
    date = nextDate(date);
  }

  const firstPoint = points[0];
  if (!firstPoint) {
    throw new Error("Forecast range must contain at least one date");
  }

  let lowestPoint = firstPoint;
  let runwayDays: number | null = null;
  for (const [index, point] of points.entries()) {
    if (point.balanceCents < lowestPoint.balanceCents) lowestPoint = point;
    if (runwayDays === null && point.balanceCents < input.safetyThresholdCents) {
      runwayDays = index;
    }
  }

  return {
    points,
    lowestBalanceCents: lowestPoint.balanceCents,
    lowestBalanceDate: lowestPoint.date,
    runwayDays,
  };
}
