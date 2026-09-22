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

  it("formats the chart risk date for the dashboard summary", () => {
    const model = buildDashboardViewModel(sourceData(), referenceOptions);

    expect(model.chart.summary).toBe(
      "Le scénario certain passe sous le seuil de sécurité le 13/11.",
    );
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

  it("offers invoicing actions only for active or completed engagements", () => {
    const data = sourceData();
    const schedule = data.billingScheduleItems[0]!;
    data.billingScheduleItems = [
      { ...schedule, id: "schedule-active", engagementStatus: "active" },
      { ...schedule, id: "schedule-completed", engagementStatus: "completed" },
      { ...schedule, id: "schedule-draft", engagementStatus: "draft" },
      { ...schedule, id: "schedule-cancelled", engagementStatus: "cancelled" },
    ];

    const model = buildDashboardViewModel(data, referenceOptions);

    expect(model.itemsToInvoice.map(({ id }) => id)).toEqual([
      "schedule-active",
      "schedule-completed",
    ]);
  });

  it("includes J+30 but excludes J+31 from the 30-day KPI", () => {
    const data = sourceData();
    const invoice = data.invoices[1]!;
    data.invoices = [
      {
        ...invoice,
        id: "invoice-j-plus-30",
        expectedPaymentDate: localDate("2026-10-05"),
        amountTtcCents: moneyCents(100_000),
      },
      {
        ...invoice,
        id: "invoice-j-plus-31",
        expectedPaymentDate: localDate("2026-10-06"),
        amountTtcCents: moneyCents(200_000),
      },
    ];
    data.billingScheduleItems = [];
    data.opportunities = [];
    data.plannedCashflows = [];

    const model = buildDashboardViewModel(data, referenceOptions);

    expect(model.kpis.inflows30DaysCents).toBe(100_000);
    expect(model.kpis.projected30DaysCents).toBe(4_338_000);
  });

  it("preserves negative projected balances without clamping", () => {
    const data = sourceData();
    data.settings.manualCurrentBalanceCents = moneyCents(100_000);
    data.settings.safetyThresholdCents = moneyCents(0);
    data.invoices = [];
    data.billingScheduleItems = [];
    data.opportunities = [];
    data.plannedCashflows = [{
      ...data.plannedCashflows[1]!,
      id: "large-expense",
      plannedDate: localDate("2026-09-06"),
      amountCents: moneyCents(150_000),
    }];

    const model = buildDashboardViewModel(data, referenceOptions);

    expect(model.kpis.projected30DaysCents).toBe(-50_000);
    expect(model.chart.points.find(({ date }) => date === "2026-09-06")?.certainBalanceCents)
      .toBe(-50_000);
  });

  it("renders a stable dashboard when an open opportunity has zero value", () => {
    const data = sourceData();
    data.invoices = [];
    data.billingScheduleItems = [];
    data.plannedCashflows = [];
    data.opportunities = [{
      ...data.opportunities[0]!,
      id: "zero-opportunity",
      estimatedAmountHtCents: moneyCents(0),
    }];

    const model = buildDashboardViewModel(data, {
      ...referenceOptions,
      scenario: "probable",
    });

    expect(model.treasuryEvents).toEqual([]);
    expect(model.kpis.inflows30DaysCents).toBe(0);
    expect(model.kpis.projected30DaysCents).toBe(4_238_000);
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
  it.each(["certain", "committed", "probable"] as const)(
    "keeps cumulative chart amounts when selecting %s through a legacy filtered URL",
    (scenario) => {
      const model = buildDashboardViewModel(sourceData(), resolveDashboardOptions(
        { scenario, filters: "1", invoices: "0", expenses: "0" },
        { horizonDays: 90, scenario: "certain" },
        referenceOptions.today,
      ));
      const point = model.chart.points.find(({ date }) => date === "2026-11-01");
      expect(point?.certainBalanceCents).toBe(4_145_000);
      expect(point?.committedBalanceCents).toBe(4_445_000);
      expect(point?.probableBalanceCents).toBe(4_645_000);
    },
  );

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
        expenses: true,
        signedOrders: true,
        weightedOpportunities: true,
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
        signedOrders: true,
        weightedOpportunities: true,
      },
    });
  });
});

const bankAccount = { id: "bank-a", name: "Compte exemple", iban_masked: null, currency: "EUR", current_balance_cents: 200000, available_balance_cents: 150000, status: "active" as const, is_current: true, updated_at: "2026-09-10T10:00:00Z" };
function bankingData(): DashboardSourceData {
 const data = sourceData(); data.settings.manualCurrentBalanceCents = moneyCents(100000);
 data.banking = { integration: {id: "qonto", status: "connected", last_success_at: "2026-09-10T10:00:00Z", last_connection_succeeded: true, last_error_code: null}, accounts: [{...bankAccount}, { ...bankAccount, id: "bank-b", current_balance_cents: 300000 }] };
 return data;
}
function bankModel(data: DashboardSourceData) { return buildDashboardViewModel(data, resolveDashboardOptions({}, {horizonDays:90,scenario:"certain"}, localDate("2026-09-05"))); }
describe("published banking opening balance", () => {
 it("uses EUR 200000 + 300000 instead of adding manual 100000 throughout forecasts and reserves", () => {
  const data = bankingData(); const model = bankModel(data); const manual = bankModel({...data, banking: undefined});
  expect(model.kpis.currentBalanceCents).toBe(500000); expect(model.openingBalanceSource).toBe("qonto"); expect(model.chart.points[0]?.certainBalanceCents).toBe(500000);
  for (const [index, point] of model.chart.points.entries()) for (const key of ["certainBalanceCents", "committedBalanceCents", "probableBalanceCents"] as const) expect(point[key] - manual.chart.points[index]![key]).toBe(400000);
  expect(model.kpis.availableBalanceCents - manual.kpis.availableBalanceCents).toBe(400000);
  expect(model.treasuryEvents[0]!.runningBalanceCents - manual.treasuryEvents[0]!.runningBalanceCents).toBe(400000);
 });
 it("accepts zero and explicitly excludes foreign, closed and noncurrent accounts", () => {
  const data = bankingData(); data.banking!.accounts = [{...bankAccount,current_balance_cents:0}, {...bankAccount,currency:"USD"}, {...bankAccount,status:"closed"}, {...bankAccount,is_current:false}];
  const model = bankModel(data); expect(model.openingBalanceCents).toBe(0); expect(model.openingBalanceSource).toBe("qonto"); expect(model.excludedBankCurrencies).toEqual(["USD"]);
 });
 it("keeps published source/date after failure, independently of live config", () => {
  const data = bankingData(); data.banking!.integration!.status = "error"; data.banking!.integration!.last_error_code = "PROVIDER_AUTH_EXPIRED";
  const model = bankModel(data); expect(model.openingBalanceSource).toBe("qonto"); expect(model.openingBalanceAsOf).toBe("2026-09-10T10:00:00Z"); expect(model.lastBankSyncSucceeded).toBe(false);
 });
 it.each(["unpublished", "no-current-eur"])("falls back to manual only for %s", condition => {
  const data = bankingData(); if (condition === "unpublished") data.banking!.integration!.last_success_at = null; else data.banking!.accounts = [{...bankAccount,currency:"USD"}];
  const model = bankModel(data); expect(model.openingBalanceSource).toBe("manual"); expect(model.openingBalanceCents).toBe(100000);
 });
 it.each([undefined, null, Number.MAX_SAFE_INTEGER + 1])("never silently treats invalid bank balance as zero", balance => {
  const data = bankingData(); Object.assign(data.banking!.accounts[0]!, {current_balance_cents:balance}); expect(() => bankModel(data)).toThrow();
 });
 it("rejects unsafe aggregate balances", () => { const data = bankingData(); data.banking!.accounts[0]!.current_balance_cents = Number.MAX_SAFE_INTEGER; expect(() => bankModel(data)).toThrow(); });
 it("never turns completed or pending bank history into forecast events", () => {
  const data = bankingData(); const before = bankModel(data); Object.assign(data.banking!, {transactions:[{status:"completed",amount_cents:200000},{status:"pending",amount_cents:100000}]}); expect(bankModel(data)).toEqual(before);
 });
});

it("carries paid months to forecasts without replaying bank history or losing a zero balance", () => {
  const data = bankingData();
  data.banking!.accounts = [{ ...bankAccount, current_balance_cents: 0 }];
  data.invoices = []; data.billingScheduleItems = []; data.opportunities = []; data.plannedCashflows = [];
  data.recurringCashflows = [{ id: "linked", direction: "outflow", cashflowKind: "expense", label: "Synthetic", amountCents: moneyCents(1000), frequency: "monthly", dayOfMonth: 20, startDate: localDate("2026-09-01"), endDate: null, active: true, certainty: "certain", probabilityBasisPoints: 10000 }];
  data.paidMonthsByRecurringId = { linked: ["2026-09"] };
  const model = bankModel(data);
  expect(model.openingBalanceCents).toBe(0);
  expect(model.treasuryEvents.map(event => event.plannedDate)).toEqual(["2026-10-20", "2026-11-20"]);
  expect(model.treasuryEvents.at(-1)?.runningBalanceCents).toBe(-2000);
});
it("does not suppress manual-balance forecasts from a detached paid-month map", () => {
  const data = sourceData();
  data.recurringCashflows = [{ id: "linked", direction: "outflow", cashflowKind: "expense", label: "Synthetic", amountCents: moneyCents(1000), frequency: "monthly", dayOfMonth: 20, startDate: localDate("2026-09-01"), endDate: null, active: true, certainty: "certain", probabilityBasisPoints: 10000 }];
  const id = "linked";
  const withoutPayments = bankModel(data);
  data.paidMonthsByRecurringId = { [id]: ["2026-09", "2026-10", "2026-11"] };
  expect(bankModel(data).treasuryEvents).toEqual(withoutPayments.treasuryEvents);
});


it("distinguishes an in-progress server sync from a failed publication", () => {
 const data = bankingData(); data.banking!.integration!.status = "syncing";
 const model = bankModel(data);
 expect(model.bankSyncInProgress).toBe(true);
 expect(model.lastBankSyncSucceeded).toBeNull();
 expect(model.timezone).toBe("Europe/Paris");
 expect(model.openingBalanceSource).toBe("qonto");
});

it("uses all banks and their oldest publication without labeling them Qonto", () => {
 const data=bankingData();
 data.banking!.integrations=[
  {...data.banking!.integration!,provider:"qonto"},
  {...data.banking!.integration!,id:"33333333-3333-4333-8333-333333333333",provider:"bunq",last_success_at:"2026-09-09T10:00:00Z",status:"error",last_error_code:"PROVIDER_UNAVAILABLE"},
 ];
 const model=bankModel(data);
 expect(model.openingBalanceSource).toBe("banking");
 expect(model.openingBalanceAsOf).toBe("2026-09-09T10:00:00Z");
 expect(model.lastBankSyncSucceeded).toBe(false);
});
