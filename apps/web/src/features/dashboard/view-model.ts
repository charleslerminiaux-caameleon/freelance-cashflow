import { buildBalanceHistory, type BalanceHistory } from "./balance-history";
import type { BankingSnapshot } from "@/features/banking/repository";
import {
  buildCashflowEvents,
  calculateForecast,
  type BillingScheduleForecastSource,
  type CashflowEvent,
  type CashflowSnapshot,
  type ForecastScenario,
  type InvoiceForecastSource,
  type OpportunityForecastSource,
  type PlannedForecastSource,
  type RecurringForecastSource,
} from "@fc/domain";
import {
  formatShortLocalDate,
  localDate,
  moneyCents,
  type LocalDate,
  type MoneyCents,
} from "@fc/shared";

export type DashboardHorizonDays = 30 | 90 | 180;

export type DashboardInclusions = {
  invoices: boolean;
  expenses: boolean;
  signedOrders: boolean;
  weightedOpportunities: boolean;
};

export type DashboardOptions = {
  today: LocalDate;
  horizonDays: DashboardHorizonDays;
  scenario: ForecastScenario;
  inclusions: DashboardInclusions;
};

export type DashboardInvoiceSource = InvoiceForecastSource & {
  invoiceNumber: string;
  customerName: string;
  issuedAt: LocalDate;
  dueAt: LocalDate;
};

export type DashboardBillingScheduleSource = BillingScheduleForecastSource & {
  engagementId: string;
  engagementReference: string;
  customerName: string;
  plannedInvoiceDate: LocalDate;
};

export type DashboardOpportunitySource = OpportunityForecastSource & {
  customerName: string;
};

export type DashboardSourceData = {
  banking?: BankingSnapshot;
  paidMonthsByRecurringId?: Readonly<Record<string, readonly string[]>>;
  settings: {
    currency: string;
    timezone: string;
    manualCurrentBalanceCents: MoneyCents;
    manualBalanceAsOf: LocalDate;
    safetyThresholdCents: MoneyCents;
    defaultForecastHorizonDays: number;
    defaultScenario: ForecastScenario;
  };
  invoices: DashboardInvoiceSource[];
  billingScheduleItems: DashboardBillingScheduleSource[];
  opportunities: DashboardOpportunitySource[];
  recurringCashflows: RecurringForecastSource[];
  plannedCashflows: PlannedForecastSource[];
};

export type DashboardChartPoint = {
  date: LocalDate;
  certainBalanceCents: MoneyCents;
  committedBalanceCents: MoneyCents;
  probableBalanceCents: MoneyCents;
  safetyThresholdCents: MoneyCents;
};

export type DashboardTreasuryEvent = CashflowEvent & {
  amountCents: MoneyCents;
  runningBalanceCents: MoneyCents;
};

export type DashboardViewModel = {
  timezone: string;
  bankSyncInProgress: boolean;
  currency: string;
  today: LocalDate;
  horizonDays: DashboardHorizonDays;
  scenario: ForecastScenario;
  inclusions: DashboardInclusions;
  openingBalanceCents: MoneyCents;
  openingBalanceAsOf: string;
  openingBalanceSource: "manual" | "qonto" | "banking";
  excludedBankCurrencies: string[];
  lastBankSyncSucceeded: boolean | null;
  safetyThresholdCents: MoneyCents;
  kpis: {
    currentBalanceCents: MoneyCents;
    availableBalanceCents: MoneyCents;
    inflows30DaysCents: MoneyCents;
    outflows30DaysCents: MoneyCents;
    projected30DaysCents: MoneyCents;
    runwayDays: number | null;
  };
  chart: {
    history?: BalanceHistory;
    points: DashboardChartPoint[];
    riskDate: LocalDate | null;
    summary: string;
  };
  overdueInvoices: Array<{
    id: string;
    invoiceNumber: string;
    customerName: string;
    dueAt: LocalDate;
    remainingCents: MoneyCents;
    daysOverdue: number;
  }>;
  itemsToInvoice: Array<{
    id: string;
    engagementId: string;
    label: string;
    engagementReference: string;
    customerName: string;
    plannedInvoiceDate: LocalDate;
    amountCents: MoneyCents;
  }>;
  upcomingInflows: DashboardTreasuryEvent[];
  upcomingOutflows: DashboardTreasuryEvent[];
  treasuryEvents: DashboardTreasuryEvent[];
};

type SearchParameters = Record<string, string | string[] | undefined>;

const supportedHorizons: DashboardHorizonDays[] = [30, 90, 180];
const supportedScenarios: ForecastScenario[] = ["certain", "committed", "probable"];

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isHorizon(value: number): value is DashboardHorizonDays {
  return supportedHorizons.includes(value as DashboardHorizonDays);
}

function isScenario(value: string | undefined): value is ForecastScenario {
  return supportedScenarios.includes(value as ForecastScenario);
}

export function resolveDashboardOptions(
  searchParameters: SearchParameters,
  defaults: { horizonDays: number; scenario: ForecastScenario },
  today: LocalDate,
): DashboardOptions {
  const requestedHorizon = Number(firstValue(searchParameters.horizon));
  const defaultHorizon = isHorizon(defaults.horizonDays) ? defaults.horizonDays : 90;
  const requestedScenario = firstValue(searchParameters.scenario);

  return {
    today,
    horizonDays: isHorizon(requestedHorizon) ? requestedHorizon : defaultHorizon,
    scenario: isScenario(requestedScenario) ? requestedScenario : defaults.scenario,
    // Each chart series applies its own cumulative scenario rules.
    // Legacy source filters must not hide sources from those scenarios.
    inclusions: {
      invoices: true,
      expenses: true,
      signedOrders: true,
      weightedOpportunities: true,
    },
  };
}

function dateAtUtcMidnight(date: LocalDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function addDays(date: LocalDate, days: number): LocalDate {
  const result = dateAtUtcMidnight(date);
  result.setUTCDate(result.getUTCDate() + days);
  return localDate(result.toISOString().slice(0, 10));
}

function daysBetween(earlier: LocalDate, later: LocalDate): number {
  return Math.round((dateAtUtcMidnight(later).getTime() - dateAtUtcMidnight(earlier).getTime()) / 86_400_000);
}

function includesEvent(event: CashflowEvent, inclusions: DashboardInclusions): boolean {
  if (event.sourceType === "invoice") return inclusions.invoices;
  if (event.sourceType === "billing_schedule") return inclusions.signedOrders;
  if (event.sourceType === "opportunity") return inclusions.weightedOpportunities;
  return inclusions.expenses;
}

function includesScenario(event: CashflowEvent, scenario: ForecastScenario): boolean {
  if (scenario === "certain") return event.certainty === "certain";
  if (scenario === "committed") return event.certainty !== "probable";
  return true;
}

function projectedAmount(event: CashflowEvent, scenario: ForecastScenario): MoneyCents {
  if (scenario !== "probable" || event.certainty !== "probable") return event.amountCents;
  const numerator = BigInt(event.amountCents) * BigInt(event.probabilityBasisPoints);
  const quotient = numerator / 10_000n;
  const remainder = numerator % 10_000n;
  return moneyCents(Number(quotient + (remainder >= 5_000n ? 1n : 0n)));
}

function compareMoneyDescending(left: MoneyCents, right: MoneyCents): number {
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

export function selectOpeningBalance(data: Pick<DashboardSourceData, "settings" | "banking">): {
  source: "manual" | "qonto" | "banking";
  balanceCents: MoneyCents;
  asOf: string;
  excludedCurrencies: string[];
  lastSyncSucceeded: boolean | null;
} {
  const integrations = data.banking?.integrations ?? (data.banking?.integration ? [{ ...data.banking.integration, provider: "qonto" }] : []);
  const published = integrations.filter(row => row.last_success_at);
  const oldestPublication = published.map(row => row.last_success_at!).sort((a,b) => Date.parse(a) - Date.parse(b))[0];
  const currentAccounts = (data.banking?.accounts ?? []).filter(
    account => account.is_current && account.status === "active",
  );
  const excludedCurrencies = [...new Set(
    currentAccounts
      .filter(account => account.currency !== data.settings.currency)
      .map(account => account.currency),
  )].sort();
  const accounts = currentAccounts.filter(account => account.currency === data.settings.currency);
  const lastSyncSucceeded = integrations.some(row => row.last_error_code || row.status === "error") ? false
    : integrations.some(row => row.status === "syncing") ? null
    : published.length ? published.every(row => row.status === "connected") : null;

  if (!oldestPublication || accounts.length === 0) {
    return {
      source: "manual",
      balanceCents: moneyCents(data.settings.manualCurrentBalanceCents),
      asOf: data.settings.manualBalanceAsOf,
      excludedCurrencies,
      lastSyncSucceeded,
    };
  }

  const total = accounts.reduce(
    (sum, account) => sum + BigInt(moneyCents(account.current_balance_cents)),
    0n,
  );
  return {
    source: published.every(row => row.provider === "qonto") ? "qonto" : "banking",
    balanceCents: moneyCents(Number(total)),
    asOf: oldestPublication,
    excludedCurrencies,
    lastSyncSucceeded,
  };
}

export function buildDashboardViewModel(
  data: DashboardSourceData,
  options: DashboardOptions,
): DashboardViewModel {
  const opening = selectOpeningBalance(data);
  const endDate = addDays(options.today, options.horizonDays);
  const thirtyDayEnd = addDays(options.today, 30);
  const snapshot: CashflowSnapshot = {
    invoices: data.invoices,
    billingScheduleItems: data.billingScheduleItems,
    opportunities: data.opportunities,
    recurringCashflows: data.recurringCashflows,
    plannedCashflows: data.plannedCashflows,
  };
  const allEvents = buildCashflowEvents(snapshot, { startDate: options.today, endDate }, opening.source !== "manual" ? data.paidMonthsByRecurringId : undefined);
  const events = allEvents.filter((event) => includesEvent(event, options.inclusions));
  const forecasts = {
    certain: calculateForecast({
      startBalanceCents: opening.balanceCents,
      startDate: options.today,
      endDate,
      safetyThresholdCents: data.settings.safetyThresholdCents,
      scenario: "certain",
      events,
    }),
    committed: calculateForecast({
      startBalanceCents: opening.balanceCents,
      startDate: options.today,
      endDate,
      safetyThresholdCents: data.settings.safetyThresholdCents,
      scenario: "committed",
      events,
    }),
    probable: calculateForecast({
      startBalanceCents: opening.balanceCents,
      startDate: options.today,
      endDate,
      safetyThresholdCents: data.settings.safetyThresholdCents,
      scenario: "probable",
      events,
    }),
  };
  const selectedForecast = forecasts[options.scenario];
  const thirtyDayPoints = selectedForecast.points.filter(({ date }) => date <= thirtyDayEnd);
  const thirtyDayClosingPoint = thirtyDayPoints.at(-1);
  if (!thirtyDayClosingPoint) throw new Error("Dashboard forecast must include the current day");

  const reservedCents = allEvents
    .filter((event) => event.sourceType === "reserve")
    .reduce((total, event) => moneyCents(total + event.amountCents), moneyCents(0));
  const overdueInvoices = data.invoices
    .filter((invoice) =>
      invoice.dueAt < options.today
      && ["issued", "partially_paid", "overdue"].includes(invoice.status)
      && invoice.paidAmountCents < invoice.amountTtcCents,
    )
    .map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      dueAt: invoice.dueAt,
      remainingCents: moneyCents(invoice.amountTtcCents - invoice.paidAmountCents),
      daysOverdue: daysBetween(invoice.dueAt, options.today),
    }))
    .sort((left, right) =>
      left.dueAt.localeCompare(right.dueAt)
      || compareMoneyDescending(left.remainingCents, right.remainingCents),
    );
  const itemsToInvoice = data.billingScheduleItems
    .filter((item) =>
      item.status === "planned"
      && ["active", "completed"].includes(item.engagementStatus)
      && item.plannedInvoiceDate <= endDate,
    )
    .map((item) => ({
      id: item.id,
      engagementId: item.engagementId,
      label: item.label,
      engagementReference: item.engagementReference,
      customerName: item.customerName,
      plannedInvoiceDate: item.plannedInvoiceDate,
      amountCents: item.amountTtcCents,
    }))
    .sort((left, right) =>
      left.plannedInvoiceDate.localeCompare(right.plannedInvoiceDate)
      || compareMoneyDescending(left.amountCents, right.amountCents),
    );

  let runningBalance = opening.balanceCents;
  const treasuryEvents = events
    .filter((event) => includesScenario(event, options.scenario))
    .map((event) => {
      const amountCents = projectedAmount(event, options.scenario);
      runningBalance = moneyCents(
        runningBalance + (event.direction === "inflow" ? amountCents : -amountCents),
      );
      return { ...event, amountCents, runningBalanceCents: runningBalance };
    });
  const riskPoint = selectedForecast.runwayDays === null
    ? null
    : selectedForecast.points[selectedForecast.runwayDays] ?? null;

  return {
    currency: data.settings.currency,
    timezone: data.settings.timezone,
    bankSyncInProgress: data.banking?.integrations?.some(row => row.status === "syncing") ?? data.banking?.integration?.status === "syncing",
    today: options.today,
    horizonDays: options.horizonDays,
    scenario: options.scenario,
    inclusions: options.inclusions,
    openingBalanceCents: opening.balanceCents,
    openingBalanceAsOf: opening.asOf,
    openingBalanceSource: opening.source,
    excludedBankCurrencies: opening.excludedCurrencies,
    lastBankSyncSucceeded: opening.lastSyncSucceeded,
    safetyThresholdCents: data.settings.safetyThresholdCents,
    kpis: {
      currentBalanceCents: opening.balanceCents,
      availableBalanceCents: moneyCents(opening.balanceCents - reservedCents),
      inflows30DaysCents: moneyCents(
        thirtyDayPoints.reduce((total, point) => total + point.inflowsCents, 0),
      ),
      outflows30DaysCents: moneyCents(
        thirtyDayPoints.reduce((total, point) => total + point.outflowsCents, 0),
      ),
      projected30DaysCents: thirtyDayClosingPoint.balanceCents,
      runwayDays: selectedForecast.runwayDays,
    },
    chart: {
      history: buildBalanceHistory(data.banking, data.settings.currency, data.settings.timezone, options.today),
      points: forecasts.certain.points.map((point, index) => ({
        date: point.date,
        certainBalanceCents: point.balanceCents,
        committedBalanceCents: forecasts.committed.points[index]!.balanceCents,
        probableBalanceCents: forecasts.probable.points[index]!.balanceCents,
        safetyThresholdCents: data.settings.safetyThresholdCents,
      })),
      riskDate: riskPoint?.date ?? null,
      summary: riskPoint
        ? `Le scénario ${options.scenario} passe sous le seuil de sécurité le ${formatShortLocalDate(riskPoint.date)}.`
        : `Le scénario ${options.scenario} reste au-dessus du seuil sur ${options.horizonDays} jours.`,
    },
    overdueInvoices,
    itemsToInvoice,
    upcomingInflows: treasuryEvents.filter(({ direction }) => direction === "inflow"),
    upcomingOutflows: treasuryEvents.filter(({ direction }) => direction === "outflow"),
    treasuryEvents,
  };
}
