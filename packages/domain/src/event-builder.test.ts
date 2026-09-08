import { localDate, moneyCents } from "@fc/shared";
import { describe, expect, it } from "vitest";

import { buildCashflowEvents, type CashflowSnapshot } from "./event-builder";

const range = {
  startDate: localDate("2026-09-01"),
  endDate: localDate("2026-12-31"),
};

function snapshot(overrides: Partial<CashflowSnapshot> = {}): CashflowSnapshot {
  return {
    invoices: [],
    billingScheduleItems: [],
    opportunities: [],
    recurringCashflows: [],
    plannedCashflows: [],
    ...overrides,
  };
}

describe("buildCashflowEvents", () => {
  it("assembles exact invoice balances, committed schedules, weighted opportunities, expenses, and reserves", () => {
    const events = buildCashflowEvents(
      snapshot({
        invoices: [
          {
            id: "invoice-1",
            billingScheduleItemId: "schedule-invoiced",
            label: "Facture F-001",
            expectedPaymentDate: localDate("2026-09-20"),
            amountTtcCents: moneyCents(120_000),
            paidAmountCents: moneyCents(20_000),
            status: "partially_paid",
          },
        ],
        billingScheduleItems: [
          {
            id: "schedule-invoiced",
            label: "Acompte déjà facturé",
            expectedPaymentDate: localDate("2026-09-25"),
            amountTtcCents: moneyCents(120_000),
            status: "planned",
            engagementStatus: "active",
          },
          {
            id: "schedule-2",
            label: "Solde signé",
            expectedPaymentDate: localDate("2026-10-01"),
            amountTtcCents: moneyCents(80_000),
            status: "planned",
            engagementStatus: "active",
          },
        ],
        opportunities: [
          {
            id: "opportunity-1",
            label: "Mission potentielle",
            expectedCloseDate: localDate("2026-10-20"),
            estimatedAmountHtCents: moneyCents(500_000),
            probabilityBasisPoints: 4_000,
            status: "proposal",
            convertedEngagementId: null,
          },
        ],
        recurringCashflows: [
          {
            id: "expense-1",
            direction: "outflow",
            cashflowKind: "expense",
            label: "Loyer",
            amountCents: moneyCents(90_000),
            frequency: "monthly",
            dayOfMonth: 31,
            startDate: localDate("2026-09-30"),
            endDate: localDate("2026-11-15"),
            certainty: "certain",
            probabilityBasisPoints: 7_000,
            active: true,
          },
        ],
        plannedCashflows: [
          {
            id: "reserve-1",
            direction: "outflow",
            cashflowKind: "reserve",
            label: "Réserve sociale",
            amountCents: moneyCents(45_000),
            plannedDate: localDate("2026-12-15"),
            certainty: "committed",
            probabilityBasisPoints: 5_000,
            status: "planned",
          },
        ],
      }),
      range,
    );

    expect(events).toEqual([
      {
        id: "invoice:invoice-1:2026-09-20",
        direction: "inflow",
        sourceType: "invoice",
        sourceId: "invoice-1",
        label: "Facture F-001",
        amountCents: 100_000,
        plannedDate: "2026-09-20",
        certainty: "certain",
        probabilityBasisPoints: 10_000,
        isActual: false,
      },
      {
        id: "recurring_cashflow:expense-1:2026-09-30",
        direction: "outflow",
        sourceType: "recurring_cashflow",
        sourceId: "expense-1",
        label: "Loyer",
        amountCents: 90_000,
        plannedDate: "2026-09-30",
        certainty: "certain",
        probabilityBasisPoints: 10_000,
        isActual: false,
      },
      {
        id: "billing_schedule:schedule-2:2026-10-01",
        direction: "inflow",
        sourceType: "billing_schedule",
        sourceId: "schedule-2",
        label: "Solde signé",
        amountCents: 80_000,
        plannedDate: "2026-10-01",
        certainty: "committed",
        probabilityBasisPoints: 10_000,
        isActual: false,
      },
      {
        id: "recurring_cashflow:expense-1:2026-10-31",
        direction: "outflow",
        sourceType: "recurring_cashflow",
        sourceId: "expense-1",
        label: "Loyer",
        amountCents: 90_000,
        plannedDate: "2026-10-31",
        certainty: "certain",
        probabilityBasisPoints: 10_000,
        isActual: false,
      },
      {
        id: "opportunity:opportunity-1:2026-10-20",
        direction: "inflow",
        sourceType: "opportunity",
        sourceId: "opportunity-1",
        label: "Mission potentielle",
        amountCents: 500_000,
        plannedDate: "2026-10-20",
        certainty: "probable",
        probabilityBasisPoints: 4_000,
        isActual: false,
      },
      {
        id: "planned_cashflow:reserve:reserve-1:2026-12-15",
        direction: "outflow",
        sourceType: "reserve",
        sourceId: "reserve-1",
        label: "Réserve sociale",
        amountCents: 45_000,
        plannedDate: "2026-12-15",
        certainty: "committed",
        probabilityBasisPoints: 10_000,
        isActual: false,
      },
    ].sort((left, right) => left.plannedDate.localeCompare(right.plannedDate) || left.id.localeCompare(right.id)));
  });

  it("excludes paid and cancelled invoices while preserving schedule precedence", () => {
    const events = buildCashflowEvents(
      snapshot({
        invoices: [
          {
            id: "paid-invoice",
            billingScheduleItemId: "linked-schedule",
            label: "Facture payée",
            expectedPaymentDate: localDate("2026-09-10"),
            amountTtcCents: moneyCents(100_000),
            paidAmountCents: moneyCents(100_000),
            status: "paid",
          },
          {
            id: "cancelled-invoice",
            billingScheduleItemId: null,
            label: "Facture annulée",
            expectedPaymentDate: localDate("2026-09-11"),
            amountTtcCents: moneyCents(100_000),
            paidAmountCents: moneyCents(0),
            status: "cancelled",
          },
        ],
        billingScheduleItems: [
          {
            id: "linked-schedule",
            label: "Échéance liée",
            expectedPaymentDate: localDate("2026-09-12"),
            amountTtcCents: moneyCents(100_000),
            status: "planned",
            engagementStatus: "active",
          },
          {
            id: "invoiced-schedule",
            label: "Échéance facturée",
            expectedPaymentDate: localDate("2026-09-13"),
            amountTtcCents: moneyCents(100_000),
            status: "invoiced",
            engagementStatus: "active",
          },
          {
            id: "cancelled-schedule",
            label: "Échéance annulée",
            expectedPaymentDate: localDate("2026-09-14"),
            amountTtcCents: moneyCents(100_000),
            status: "cancelled",
            engagementStatus: "active",
          },
        ],
      }),
      range,
    );

    expect(events).toEqual([]);
  });

  it("excludes converted and terminal opportunities", () => {
    const base = {
      label: "Mission",
      expectedCloseDate: localDate("2026-09-20"),
      estimatedAmountHtCents: moneyCents(100_000),
      probabilityBasisPoints: 4_000,
    };

    const events = buildCashflowEvents(
      snapshot({
        opportunities: [
          { ...base, id: "converted", status: "proposal", convertedEngagementId: "engagement-1" },
          { ...base, id: "won", status: "won", convertedEngagementId: null },
          { ...base, id: "lost", status: "lost", convertedEngagementId: null },
        ],
      }),
      range,
    );

    expect(events).toEqual([]);
  });

  it("respects recurring activity, source end dates, planned status, and inclusive forecast bounds", () => {
    const recurringBase = {
      direction: "outflow" as const,
      cashflowKind: "remuneration" as const,
      label: "Rémunération",
      amountCents: moneyCents(200_000),
      frequency: "monthly" as const,
      dayOfMonth: 1,
      certainty: "certain" as const,
      probabilityBasisPoints: 10_000,
    };
    const plannedBase = {
      direction: "outflow" as const,
      cashflowKind: "expense" as const,
      label: "Achat",
      amountCents: moneyCents(10_000),
      certainty: "certain" as const,
      probabilityBasisPoints: 10_000,
    };

    const events = buildCashflowEvents(
      snapshot({
        recurringCashflows: [
          {
            ...recurringBase,
            id: "inactive",
            startDate: localDate("2026-09-01"),
            endDate: null,
            active: false,
          },
          {
            ...recurringBase,
            id: "ended",
            startDate: localDate("2026-08-01"),
            endDate: localDate("2026-08-31"),
            active: true,
          },
          {
            ...recurringBase,
            id: "bounded",
            startDate: localDate("2026-08-01"),
            endDate: localDate("2026-09-01"),
            active: true,
          },
        ],
        plannedCashflows: [
          { ...plannedBase, id: "before", plannedDate: localDate("2026-08-31"), status: "planned" },
          { ...plannedBase, id: "cancelled", plannedDate: localDate("2026-09-15"), status: "cancelled" },
          { ...plannedBase, id: "realized", plannedDate: localDate("2026-09-16"), status: "realized" },
          { ...plannedBase, id: "on-end", plannedDate: localDate("2026-12-31"), status: "planned" },
        ],
      }),
      range,
    );

    expect(events.map((event) => event.id)).toEqual([
      "recurring_cashflow:remuneration:bounded:2026-09-01",
      "planned_cashflow:on-end:2026-12-31",
    ]);
  });

  it("keeps recurring and planned special-kind events distinct when ids and dates coincide", () => {
    const events = buildCashflowEvents(
      snapshot({
        recurringCashflows: [
          {
            id: "shared-source",
            direction: "outflow",
            cashflowKind: "reserve",
            label: "Réserve mensuelle",
            amountCents: moneyCents(40_000),
            frequency: "monthly",
            dayOfMonth: 15,
            startDate: localDate("2026-09-15"),
            endDate: localDate("2026-09-15"),
            certainty: "certain",
            probabilityBasisPoints: 10_000,
            active: true,
          },
        ],
        plannedCashflows: [
          {
            id: "shared-source",
            direction: "outflow",
            cashflowKind: "reserve",
            label: "Réserve ponctuelle",
            amountCents: moneyCents(60_000),
            plannedDate: localDate("2026-09-15"),
            certainty: "certain",
            probabilityBasisPoints: 10_000,
            status: "planned",
          },
        ],
      }),
      range,
    );

    expect(events.map(({ id, label }) => ({ id, label }))).toEqual([
      {
        id: "planned_cashflow:reserve:shared-source:2026-09-15",
        label: "Réserve ponctuelle",
      },
      {
        id: "recurring_cashflow:reserve:shared-source:2026-09-15",
        label: "Réserve mensuelle",
      },
    ]);
  });

  it("ignores zero-value open invoices and opportunities", () => {
    const events = buildCashflowEvents(
      snapshot({
        invoices: [{
          id: "zero-invoice",
          billingScheduleItemId: null,
          label: "Facture gratuite",
          expectedPaymentDate: localDate("2026-09-15"),
          amountTtcCents: moneyCents(0),
          paidAmountCents: moneyCents(0),
          status: "issued",
        }],
        opportunities: [{
          id: "zero-opportunity",
          label: "Mission gratuite",
          expectedCloseDate: localDate("2026-09-20"),
          estimatedAmountHtCents: moneyCents(0),
          probabilityBasisPoints: 4_000,
          status: "proposal",
          convertedEngagementId: null,
        }],
      }),
      range,
    );

    expect(events).toEqual([]);
  });

  it("still rejects negative forecast source amounts", () => {
    expect(() =>
      buildCashflowEvents(
        snapshot({
          plannedCashflows: [{
            id: "negative-expense",
            direction: "outflow",
            cashflowKind: "expense",
            label: "Montant invalide",
            amountCents: moneyCents(-1),
            plannedDate: localDate("2026-09-15"),
            certainty: "certain",
            probabilityBasisPoints: 10_000,
            status: "planned",
          }],
        }),
        range,
      )
    ).toThrow("Forecast source amount must not be negative");
  });

  it("rejects invalid ranges and unsafe source amounts", () => {
    expect(() =>
      buildCashflowEvents(snapshot(), {
        startDate: localDate("2026-09-02"),
        endDate: localDate("2026-09-01"),
      }),
    ).toThrow("Cashflow event range must not be inverted");

    expect(() =>
      buildCashflowEvents(
        snapshot({
          plannedCashflows: [
            {
              id: "unsafe",
              direction: "outflow",
              cashflowKind: "expense",
              label: "Valeur invalide",
              amountCents: Number.MAX_SAFE_INTEGER + 1 as never,
              plannedDate: localDate("2026-09-15"),
              certainty: "certain",
              probabilityBasisPoints: 10_000,
              status: "planned",
            },
          ],
        }),
        range,
      ),
    ).toThrow("Money must be safe integer cents");
  });
});
