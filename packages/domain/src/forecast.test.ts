import { describe, expect, it } from "vitest";

import { calculateForecast } from "./forecast";
import type { CashflowEvent } from "./cashflow-event";
import { localDate, moneyCents } from "@fc/shared";

function event(overrides: Partial<CashflowEvent>): CashflowEvent {
  return {
    id: "event",
    direction: "inflow",
    sourceType: "planned_cashflow",
    sourceId: "source",
    label: "Event",
    amountCents: moneyCents(100),
    plannedDate: localDate("2026-09-06"),
    certainty: "certain",
    probabilityBasisPoints: 10_000,
    isActual: false,
    ...overrides,
  };
}

describe("calculateForecast", () => {
  it("creates inclusive daily points and applies weighted inflows and outflows", () => {
    const result = calculateForecast({
      startBalanceCents: moneyCents(4_000_000),
      startDate: localDate("2026-09-05"),
      endDate: localDate("2026-09-08"),
      safetyThresholdCents: moneyCents(2_000_000),
      scenario: "probable",
      events: [
        event({
          id: "invoice-1",
          sourceType: "invoice",
          sourceId: "1",
          label: "Facture",
          amountCents: moneyCents(1_000_000),
          plannedDate: localDate("2026-09-06"),
        }),
        event({
          id: "opportunity-1",
          sourceType: "opportunity",
          sourceId: "2",
          label: "Projet",
          amountCents: moneyCents(2_000_000),
          plannedDate: localDate("2026-09-07"),
          certainty: "probable",
          probabilityBasisPoints: 4_000,
        }),
        event({
          id: "tax-1",
          direction: "outflow",
          sourceType: "reserve",
          sourceId: "3",
          label: "TVA",
          amountCents: moneyCents(3_000_000),
          plannedDate: localDate("2026-09-08"),
        }),
      ],
    });

    expect(result.points).toHaveLength(4);
    expect(result.points.map((point) => point.balanceCents)).toEqual([
      4_000_000,
      5_000_000,
      5_800_000,
      2_800_000,
    ]);
    expect(result.points[1]?.inflowsCents).toBe(1_000_000);
    expect(result.points[3]?.outflowsCents).toBe(3_000_000);
    expect(result.lowestBalanceCents).toBe(2_800_000);
    expect(result.lowestBalanceDate).toBe(localDate("2026-09-08"));
    expect(result.runwayDays).toBeNull();
  });

  it("includes only certain events in the certain scenario", () => {
    const result = calculateForecast({
      startBalanceCents: moneyCents(1_000),
      startDate: localDate("2026-09-05"),
      endDate: localDate("2026-09-05"),
      safetyThresholdCents: moneyCents(0),
      scenario: "certain",
      events: [
        event({ amountCents: moneyCents(200), certainty: "certain", plannedDate: localDate("2026-09-05") }),
        event({ id: "committed", amountCents: moneyCents(300), certainty: "committed", plannedDate: localDate("2026-09-05") }),
        event({ id: "probable", amountCents: moneyCents(400), certainty: "probable", plannedDate: localDate("2026-09-05") }),
      ],
    });

    expect(result.points[0]?.balanceCents).toBe(1_200);
    expect(result.points[0]?.events.map(({ id }) => id)).toEqual(["event"]);
  });

  it("includes certain and committed events at full value in the committed scenario", () => {
    const result = calculateForecast({
      startBalanceCents: moneyCents(1_000),
      startDate: localDate("2026-09-05"),
      endDate: localDate("2026-09-05"),
      safetyThresholdCents: moneyCents(0),
      scenario: "committed",
      events: [
        event({ amountCents: moneyCents(200), certainty: "certain", plannedDate: localDate("2026-09-05") }),
        event({ id: "committed", amountCents: moneyCents(300), certainty: "committed", probabilityBasisPoints: 1_000, plannedDate: localDate("2026-09-05") }),
        event({ id: "probable", amountCents: moneyCents(400), certainty: "probable", plannedDate: localDate("2026-09-05") }),
      ],
    });

    expect(result.points[0]?.balanceCents).toBe(1_500);
  });

  it("weights probable events by their basis points in the probable scenario", () => {
    const result = calculateForecast({
      startBalanceCents: moneyCents(1_000),
      startDate: localDate("2026-09-05"),
      endDate: localDate("2026-09-05"),
      safetyThresholdCents: moneyCents(0),
      scenario: "probable",
      events: [
        event({ amountCents: moneyCents(1_000), certainty: "probable", probabilityBasisPoints: 2_500, plannedDate: localDate("2026-09-05") }),
      ],
    });

    expect(result.points[0]?.balanceCents).toBe(1_250);
  });

  it("reports the first zero-based day below the safety threshold", () => {
    const result = calculateForecast({
      startBalanceCents: moneyCents(500),
      startDate: localDate("2026-09-05"),
      endDate: localDate("2026-09-08"),
      safetyThresholdCents: moneyCents(400),
      scenario: "certain",
      events: [
        event({
          direction: "outflow",
          amountCents: moneyCents(50),
          plannedDate: localDate("2026-09-06"),
        }),
        event({
          id: "large-outflow",
          direction: "outflow",
          amountCents: moneyCents(100),
          plannedDate: localDate("2026-09-07"),
        }),
      ],
    });

    expect(result.points.map((point) => point.balanceCents)).toEqual([500, 450, 350, 350]);
    expect(result.runwayDays).toBe(2);
  });

  it("does not trigger runway while the closing balance equals the threshold", () => {
    const result = calculateForecast({
      startBalanceCents: moneyCents(500),
      startDate: localDate("2026-09-05"),
      endDate: localDate("2026-09-06"),
      safetyThresholdCents: moneyCents(400),
      scenario: "certain",
      events: [
        event({
          direction: "outflow",
          amountCents: moneyCents(100),
          plannedDate: localDate("2026-09-06"),
        }),
      ],
    });

    expect(result.points[1]?.balanceCents).toBe(400);
    expect(result.runwayDays).toBeNull();
  });

  it("rejects negative inflow event amounts", () => {
    expect(() =>
      calculateForecast({
        startBalanceCents: moneyCents(0),
        startDate: localDate("2026-09-05"),
        endDate: localDate("2026-09-06"),
        safetyThresholdCents: moneyCents(0),
        scenario: "certain",
        events: [event({ direction: "inflow", amountCents: moneyCents(-1) })],
      }),
    ).toThrow("non-negative");
  });

  it("rejects negative outflow event amounts", () => {
    expect(() =>
      calculateForecast({
        startBalanceCents: moneyCents(0),
        startDate: localDate("2026-09-05"),
        endDate: localDate("2026-09-06"),
        safetyThresholdCents: moneyCents(0),
        scenario: "certain",
        events: [event({ direction: "outflow", amountCents: moneyCents(-1) })],
      }),
    ).toThrow("non-negative");
  });

  it("rejects inverted ranges and invalid probability basis points", () => {
    expect(() =>
      calculateForecast({
        startBalanceCents: moneyCents(0),
        startDate: localDate("2026-09-06"),
        endDate: localDate("2026-09-05"),
        safetyThresholdCents: moneyCents(0),
        scenario: "certain",
        events: [],
      }),
    ).toThrow("startDate must be on or before endDate");

    expect(() =>
      calculateForecast({
        startBalanceCents: moneyCents(0),
        startDate: localDate("2026-09-05"),
        endDate: localDate("2026-09-05"),
        safetyThresholdCents: moneyCents(0),
        scenario: "certain",
        events: [event({ probabilityBasisPoints: 10_001 })],
      }),
    ).toThrow("between 0 and 10000");
  });
});
