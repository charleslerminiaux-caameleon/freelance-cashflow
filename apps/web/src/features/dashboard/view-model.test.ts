import { localDate, moneyCents } from "@fc/shared";
import { describe, expect, it } from "vitest";

import {
  buildDashboardViewModel,
  resolveDashboardOptions,
  type DashboardSourceData,
} from "./view-model";

function sourceData(): DashboardSourceData {
  return {
    settings: {
      currency: "EUR",
      timezone: "Europe/Paris",
      manualCurrentBalanceCents: moneyCents(4_238_000),
      manualBalanceAsOf: localDate("2026-09-05"),
      safetyThresholdCents: moneyCents(2_000_000),
      defaultForecastHorizonDays: 90,
      defaultScenario: "certain",
    },
    invoices: [
      {
        id: "invoice-overdue",
        billingScheduleItemId: null,
        invoiceNumber: "F-2026-031",
        customerName: "Atelier Bleu",
        label: "F-2026-031 · Atelier Bleu",
        issuedAt: localDate("2026-08-01"),
        dueAt: localDate("2026-08-27"),
        expectedPaymentDate: localDate("2026-09-10"),
        amountTtcCents: moneyCents(480_000),
        paidAmountCents: moneyCents(0),
        status: "overdue",
      },
      {
        id: "invoice-september",
        billingScheduleItemId: null,
        invoiceNumber: "F-2026-032",
        customerName: "Studio Vermeil",
        label: "F-2026-032 · Studio Vermeil",
        issuedAt: localDate("2026-09-01"),
        dueAt: localDate("2026-09-20"),
        expectedPaymentDate: localDate("2026-09-20"),
        amountTtcCents: moneyCents(600_000),
        paidAmountCents: moneyCents(0),
        status: "issued",
      },
    ],
    billingScheduleItems: [
      {
        id: "schedule-october",
        engagementId: "engagement-1",
        engagementReference: "CMD-2026-009",
        customerName: "Groupe Norda",
        label: "Jalon 2",
        plannedInvoiceDate: localDate("2026-09-15"),
        expectedPaymentDate: localDate("2026-10-20"),
        amountTtcCents: moneyCents(300_000),
        status: "planned",
        engagementStatus: "active",
      },
    ],
    opportunities: [
      {
        id: "opportunity-november",
        customerName: "Mairie de Rennes",
        label: "Refonte du portail",
        expectedCloseDate: localDate("2026-11-01"),
        estimatedAmountHtCents: moneyCents(500_000),
        probabilityBasisPoints: 4_000,
        status: "proposal",
        convertedEngagementId: null,
      },
    ],
    recurringCashflows: [],
    plannedCashflows: [
      {
        id: "reserve-sociale",
        direction: "outflow",
        cashflowKind: "reserve",
        label: "Réserve sociale",
        amountCents: moneyCents(1_120_000),
        plannedDate: localDate("2026-09-15"),
        certainty: "certain",
        probabilityBasisPoints: 10_000,
        status: "planned",
      },
      {
        id: "abonnement",
        direction: "outflow",
        cashflowKind: "expense",
        label: "Abonnements",
        amountCents: moneyCents(53_000),
        plannedDate: localDate("2026-09-22"),
        certainty: "certain",
        probabilityBasisPoints: 10_000,
        status: "planned",
      },
      {
        id: "cotisation-novembre",
        direction: "outflow",
        cashflowKind: "expense",
        label: "Cotisations de novembre",
        amountCents: moneyCents(2_200_000),
        plannedDate: localDate("2026-11-13"),
        certainty: "certain",
        probabilityBasisPoints: 10_000,
        status: "planned",
      },
    ],
  };
}

const referenceOptions = {
  today: localDate("2026-09-05"),
  horizonDays: 90 as const,
  scenario: "certain" as const,
  inclusions: {
    invoices: true,
    expenses: true,
    signedOrders: true,
    weightedOpportunities: true,
  },
};

describe("buildDashboardViewModel", () => {
  it("derives the approved reference KPIs from deterministic source events", () => {
    const model = buildDashboardViewModel(sourceData(), referenceOptions);

    expect(model.kpis).toEqual({
      currentBalanceCents: 4_238_000,
      availableBalanceCents: 3_118_000,
      inflows30DaysCents: 1_080_000,
      outflows30DaysCents: 1_173_000,
      projected30DaysCents: 4_145_000,
      runwayDays: 69,
    });
    expect(model.overdueInvoices[0]?.daysOverdue).toBe(9);
    expect(model.chart.points).toHaveLength(91);
  });

  it("builds distinct certain, committed, and weighted probable chart series", () => {
    const model = buildDashboardViewModel(sourceData(), referenceOptions);
    const october20 = model.chart.points.find(({ date }) => date === "2026-10-20");
    const november1 = model.chart.points.find(({ date }) => date === "2026-11-01");

    expect(october20).toEqual({
      date: "2026-10-20",
      certainBalanceCents: 4_145_000,
      committedBalanceCents: 4_445_000,
      probableBalanceCents: 4_445_000,
      safetyThresholdCents: 2_000_000,
    });
    expect(november1?.probableBalanceCents).toBe(4_645_000);
    expect(november1?.committedBalanceCents).toBe(4_445_000);
  });

  it("filters excluded sources from KPIs and the treasury event list", () => {
    const model = buildDashboardViewModel(sourceData(), {
      ...referenceOptions,
      inclusions: {
        invoices: false,
        expenses: true,
        signedOrders: false,
        weightedOpportunities: false,
      },
    });

    expect(model.kpis.inflows30DaysCents).toBe(0);
    expect(model.kpis.projected30DaysCents).toBe(3_065_000);
    expect(model.treasuryEvents.every(({ direction }) => direction === "outflow")).toBe(true);
  });

  it("sorts overdue invoices by due date then remaining amount", () => {
    const data = sourceData();
    data.invoices.push({
      ...data.invoices[0]!,
      id: "invoice-earliest-small",
      invoiceNumber: "F-2026-001",
      label: "F-2026-001 · Client Vert",
      dueAt: localDate("2026-08-20"),
      amountTtcCents: moneyCents(100_000),
    });
    data.invoices.push({
      ...data.invoices[0]!,
      id: "invoice-earliest-large",
      invoiceNumber: "F-2026-002",
      label: "F-2026-002 · Client Or",
      dueAt: localDate("2026-08-20"),
      amountTtcCents: moneyCents(200_000),
    });

    const model = buildDashboardViewModel(data, referenceOptions);

    expect(model.overdueInvoices.map(({ id }) => id)).toEqual([
      "invoice-earliest-large",
      "invoice-earliest-small",
      "invoice-overdue",
    ]);
  });

  it("keeps normalized events chronological and exposes their running balances", () => {
    const model = buildDashboardViewModel(sourceData(), referenceOptions);

    expect(model.treasuryEvents.slice(0, 3).map((event) => ({
      id: event.id,
      amountCents: event.amountCents,
      runningBalanceCents: event.runningBalanceCents,
    }))).toEqual([
      {
        id: "invoice:invoice-overdue:2026-09-10",
        amountCents: 480_000,
        runningBalanceCents: 4_718_000,
      },
      {
        id: "planned_cashflow:reserve:reserve-sociale:2026-09-15",
        amountCents: 1_120_000,
        runningBalanceCents: 3_598_000,
      },
      {
        id: "invoice:invoice-september:2026-09-20",
        amountCents: 600_000,
        runningBalanceCents: 4_198_000,
      },
    ]);
  });
});

describe("resolveDashboardOptions", () => {
  it("accepts only linkable supported horizons and scenarios", () => {
    expect(resolveDashboardOptions(
      { horizon: "180", scenario: "probable", filters: "1", invoices: "1" },
      { horizonDays: 90, scenario: "certain" },
      localDate("2026-09-05"),
    )).toEqual({
      today: "2026-09-05",
      horizonDays: 180,
      scenario: "probable",
      inclusions: {
        invoices: true,
        expenses: false,
        signedOrders: false,
        weightedOpportunities: false,
      },
    });
  });

  it("falls back safely for malformed URL values and legacy setting horizons", () => {
    expect(resolveDashboardOptions(
      { horizon: "366", scenario: "optimistic" },
      { horizonDays: 366, scenario: "committed" },
      localDate("2026-09-05"),
    )).toEqual({
      today: "2026-09-05",
      horizonDays: 90,
      scenario: "committed",
      inclusions: {
        invoices: true,
        expenses: true,
        signedOrders: false,
        weightedOpportunities: false,
      },
    });
  });
});
