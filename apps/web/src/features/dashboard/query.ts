import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { localDate, moneyCents, type LocalDate } from "@fc/shared";
import { z } from "zod";

import { getBankingSnapshot, type BankingSnapshot } from "@/features/banking/repository";
import { businessDateSchema } from "@/features/commercial-schema";
import { repositoryError } from "@/features/repository-error";
import {
  getOwnerSettings,
  type OwnerSettings,
} from "@/features/settings/repository";
import { createClient } from "@/lib/supabase/server";

import {
  buildDashboardViewModel,
  resolveDashboardOptions,
  type DashboardSourceData,
  type DashboardViewModel,
} from "./view-model";

const openInvoiceStatuses = ["issued", "partially_paid", "overdue"] as const;
const openOpportunityStatuses = ["lead", "qualified", "proposal"] as const;
const forecastEngagementStatuses = ["active", "completed"] as const;

const customerSchema = z.object({ name: z.string() });

const invoiceRowSchema = z.object({
  id: z.string().uuid(),
  owner_user_id: z.string().uuid(),
  billing_schedule_item_id: z.string().uuid().nullable(),
  invoice_number: z.string(),
  issued_at: businessDateSchema,
  due_at: businessDateSchema,
  expected_payment_date: businessDateSchema,
  amount_ttc_cents: z.number().int().safe().nonnegative(),
  paid_amount_cents: z.number().int().safe().nonnegative(),
  status: z.enum(["issued", "partially_paid", "overdue"]),
  customer: customerSchema,
});

const opportunityRowSchema = z.object({
  id: z.string().uuid(),
  owner_user_id: z.string().uuid(),
  name: z.string(),
  status: z.enum(["lead", "qualified", "proposal"]),
  estimated_amount_ht_cents: z.number().int().safe().nonnegative(),
  probability_basis_points: z.number().int().min(0).max(10_000),
  expected_close_date: businessDateSchema,
  converted_engagement_id: z.null(),
  customer: customerSchema,
});

const billingScheduleRowSchema = z.object({
  id: z.string().uuid(),
  owner_user_id: z.string().uuid(),
  engagement_id: z.string().uuid(),
  label: z.string(),
  planned_invoice_date: businessDateSchema,
  amount_ttc_cents: z.number().int().safe().nonnegative(),
  expected_payment_date: businessDateSchema,
  status: z.literal("planned"),
  engagement: z.object({
    reference: z.string(),
    status: z.enum(["active", "completed"]),
    customer: customerSchema,
  }),
});

const recurringCashflowRowSchema = z.object({
  id: z.string().uuid(),
  owner_user_id: z.string().uuid(),
  direction: z.literal("outflow"),
  cashflow_kind: z.enum(["expense", "remuneration", "reserve"]),
  label: z.string(),
  amount_cents: z.number().int().safe().positive(),
  frequency: z.enum(["monthly", "quarterly", "yearly"]),
  day_of_month: z.number().int().min(1).max(31),
  start_date: businessDateSchema,
  end_date: businessDateSchema.nullable(),
  certainty: z.enum(["certain", "committed", "probable"]),
  probability_basis_points: z.number().int().min(0).max(10_000),
  active: z.literal(true),
});

const plannedCashflowRowSchema = z.object({
  id: z.string().uuid(),
  owner_user_id: z.string().uuid(),
  direction: z.literal("outflow"),
  cashflow_kind: z.enum(["expense", "remuneration", "reserve"]),
  label: z.string(),
  amount_cents: z.number().int().safe().positive(),
  planned_date: businessDateSchema,
  certainty: z.enum(["certain", "committed", "probable"]),
  probability_basis_points: z.number().int().min(0).max(10_000),
  status: z.literal("planned"),
});

type DashboardInvoiceRow = z.infer<typeof invoiceRowSchema>;
type DashboardOpportunityRow = z.infer<typeof opportunityRowSchema>;
type DashboardBillingScheduleRow = z.infer<typeof billingScheduleRowSchema>;
type DashboardRecurringCashflowRow = z.infer<typeof recurringCashflowRowSchema>;
type DashboardPlannedCashflowRow = z.infer<typeof plannedCashflowRowSchema>;

export type DashboardQueryRange = {
  startDate: LocalDate;
  endDate: LocalDate;
};

export type DashboardRepositoryAdapter = {
  getBankingSnapshot: (client: SupabaseClient, ownerUserId: string) => Promise<BankingSnapshot>;
  getOwnerSettings: (client: SupabaseClient, ownerUserId: string) => Promise<OwnerSettings>;
  listRelevantInvoices: (
    client: SupabaseClient,
    ownerUserId: string,
    range: DashboardQueryRange,
  ) => Promise<DashboardInvoiceRow[]>;
  listRelevantOpportunities: (
    client: SupabaseClient,
    ownerUserId: string,
    range: DashboardQueryRange,
  ) => Promise<DashboardOpportunityRow[]>;
  listRelevantBillingScheduleItems: (
    client: SupabaseClient,
    ownerUserId: string,
    range: DashboardQueryRange,
  ) => Promise<DashboardBillingScheduleRow[]>;
  listRelevantRecurringCashflows: (
    client: SupabaseClient,
    ownerUserId: string,
    range: DashboardQueryRange,
  ) => Promise<DashboardRecurringCashflowRow[]>;
  listRelevantPlannedCashflows: (
    client: SupabaseClient,
    ownerUserId: string,
    range: DashboardQueryRange,
  ) => Promise<DashboardPlannedCashflowRow[]>;
};

const invoiceColumns = `
  id, owner_user_id, billing_schedule_item_id, invoice_number, issued_at, due_at,
  expected_payment_date, amount_ttc_cents, paid_amount_cents, status,
  customer:customers!invoices_owner_customer_fk(name)
`;
const opportunityColumns = `
  id, owner_user_id, name, status, estimated_amount_ht_cents,
  probability_basis_points, expected_close_date, converted_engagement_id,
  customer:customers!opportunities_owner_customer_fk(name)
`;
const billingScheduleColumns = `
  id, owner_user_id, engagement_id, label, planned_invoice_date,
  amount_ttc_cents, expected_payment_date, status,
  engagement:engagements!inner(
    reference,
    status,
    customer:customers!engagements_owner_customer_fk(name)
  )
`;
const recurringCashflowColumns = `
  id, owner_user_id, direction, cashflow_kind, label, amount_cents, frequency,
  day_of_month, start_date, end_date, certainty, probability_basis_points, active
`;
const plannedCashflowColumns = `
  id, owner_user_id, direction, cashflow_kind, label, amount_cents, planned_date,
  certainty, probability_basis_points, status
`;

export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = 1_000,
): Promise<T[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1_000) {
    throw new Error("Dashboard page size must be between 1 and 1000");
  }

  const rows: T[] = [];
  let from = 0;

  while (true) {
    const page = await fetchPage(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
    from += pageSize;
  }
}

async function listInvoicePage(
  client: SupabaseClient,
  ownerUserId: string,
  range: DashboardQueryRange,
  kind: "overdue" | "horizon",
  from: number,
  to: number,
): Promise<DashboardInvoiceRow[]> {
  let query = client
    .from("invoices")
    .select(invoiceColumns)
    .eq("owner_user_id", ownerUserId)
    .in("status", [...openInvoiceStatuses]);

  query = kind === "overdue"
    ? query.lt("due_at", range.startDate)
    : query
        .gte("expected_payment_date", range.startDate)
        .lte("expected_payment_date", range.endDate);

  const { data, error } = await query.order("id", { ascending: true }).range(from, to);
  if (error) throw repositoryError(error);
  return z.array(invoiceRowSchema).parse(data);
}

async function listRelevantInvoices(
  client: SupabaseClient,
  ownerUserId: string,
  range: DashboardQueryRange,
): Promise<DashboardInvoiceRow[]> {
  const [overdue, inHorizon] = await Promise.all([
    readAllPages((from, to) => listInvoicePage(client, ownerUserId, range, "overdue", from, to)),
    readAllPages((from, to) => listInvoicePage(client, ownerUserId, range, "horizon", from, to)),
  ]);
  const uniqueRows = new Map<string, DashboardInvoiceRow>();
  for (const row of [...overdue, ...inHorizon]) uniqueRows.set(row.id, row);
  return [...uniqueRows.values()];
}

async function listRelevantOpportunities(
  client: SupabaseClient,
  ownerUserId: string,
  range: DashboardQueryRange,
): Promise<DashboardOpportunityRow[]> {
  return readAllPages(async (from, to) => {
    const { data, error } = await client
      .from("opportunities")
      .select(opportunityColumns)
      .eq("owner_user_id", ownerUserId)
      .in("status", [...openOpportunityStatuses])
      .is("converted_engagement_id", null)
      .gte("expected_close_date", range.startDate)
      .lte("expected_close_date", range.endDate)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw repositoryError(error);
    return z.array(opportunityRowSchema).parse(data);
  });
}

async function listRelevantBillingScheduleItems(
  client: SupabaseClient,
  ownerUserId: string,
  range: DashboardQueryRange,
): Promise<DashboardBillingScheduleRow[]> {
  return readAllPages(async (from, to) => {
    const { data, error } = await client
      .from("billing_schedule_items")
      .select(billingScheduleColumns)
      .eq("owner_user_id", ownerUserId)
      .eq("status", "planned")
      .in("engagement.status", [...forecastEngagementStatuses])
      .lte("planned_invoice_date", range.endDate)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw repositoryError(error);
    return z.array(billingScheduleRowSchema).parse(data);
  });
}

async function listRelevantRecurringCashflows(
  client: SupabaseClient,
  ownerUserId: string,
  range: DashboardQueryRange,
): Promise<DashboardRecurringCashflowRow[]> {
  return readAllPages(async (from, to) => {
    const { data, error } = await client
      .from("recurring_cashflows")
      .select(recurringCashflowColumns)
      .eq("owner_user_id", ownerUserId)
      .eq("direction", "outflow")
      .eq("active", true)
      .lte("start_date", range.endDate)
      .or(`end_date.is.null,end_date.gte.${range.startDate}`)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw repositoryError(error);
    return z.array(recurringCashflowRowSchema).parse(data);
  });
}

async function listRelevantPlannedCashflows(
  client: SupabaseClient,
  ownerUserId: string,
  range: DashboardQueryRange,
): Promise<DashboardPlannedCashflowRow[]> {
  return readAllPages(async (from, to) => {
    const { data, error } = await client
      .from("planned_cashflows")
      .select(plannedCashflowColumns)
      .eq("owner_user_id", ownerUserId)
      .eq("direction", "outflow")
      .eq("status", "planned")
      .gte("planned_date", range.startDate)
      .lte("planned_date", range.endDate)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw repositoryError(error);
    return z.array(plannedCashflowRowSchema).parse(data);
  });
}

const repositories: DashboardRepositoryAdapter = {
  getBankingSnapshot,
  getOwnerSettings,
  listRelevantInvoices,
  listRelevantOpportunities,
  listRelevantBillingScheduleItems,
  listRelevantRecurringCashflows,
  listRelevantPlannedCashflows,
};

const ownerIdSchema = z.string().uuid();

function parseOwnerId(ownerUserId: string): string {
  const parsedOwnerId = ownerIdSchema.safeParse(ownerUserId);
  if (!parsedOwnerId.success) throw new Error("Invalid owner identifier");
  return parsedOwnerId.data;
}

export async function loadDashboardSourceData(
  client: SupabaseClient,
  ownerUserId: string,
  range: DashboardQueryRange,
  adapter: DashboardRepositoryAdapter = repositories,
  knownSettings?: OwnerSettings,
  knownBankingSnapshot?: BankingSnapshot,
): Promise<DashboardSourceData> {
  const parsedOwnerId = parseOwnerId(ownerUserId);
  const [settings, invoices, opportunities, billingScheduleItems, recurring, planned, banking] =
    await Promise.all([
      knownSettings ?? adapter.getOwnerSettings(client, parsedOwnerId),
      adapter.listRelevantInvoices(client, parsedOwnerId, range),
      adapter.listRelevantOpportunities(client, parsedOwnerId, range),
      adapter.listRelevantBillingScheduleItems(client, parsedOwnerId, range),
      adapter.listRelevantRecurringCashflows(client, parsedOwnerId, range),
      adapter.listRelevantPlannedCashflows(client, parsedOwnerId, range),
      knownBankingSnapshot ?? adapter.getBankingSnapshot(client, parsedOwnerId),
    ]);

  return {
    banking,
    settings: {
      currency: settings.currency,
      timezone: settings.timezone,
      manualCurrentBalanceCents: moneyCents(settings.manual_current_balance_cents),
      manualBalanceAsOf: settings.manual_balance_as_of,
      safetyThresholdCents: moneyCents(settings.safety_cash_threshold_cents),
      defaultForecastHorizonDays: settings.default_forecast_horizon_days,
      defaultScenario: settings.default_scenario,
    },
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      billingScheduleItemId: invoice.billing_schedule_item_id,
      invoiceNumber: invoice.invoice_number,
      customerName: invoice.customer.name,
      label: `${invoice.invoice_number} · ${invoice.customer.name}`,
      issuedAt: invoice.issued_at,
      dueAt: invoice.due_at,
      expectedPaymentDate: invoice.expected_payment_date,
      amountTtcCents: moneyCents(invoice.amount_ttc_cents),
      paidAmountCents: moneyCents(invoice.paid_amount_cents),
      status: invoice.status,
    })),
    billingScheduleItems: billingScheduleItems.map((item) => ({
      id: item.id,
      engagementId: item.engagement_id,
      engagementReference: item.engagement.reference,
      customerName: item.engagement.customer.name,
      label: item.label,
      plannedInvoiceDate: item.planned_invoice_date,
      expectedPaymentDate: item.expected_payment_date,
      amountTtcCents: moneyCents(item.amount_ttc_cents),
      status: item.status,
      engagementStatus: item.engagement.status,
    })),
    opportunities: opportunities.map((opportunity) => ({
      id: opportunity.id,
      customerName: opportunity.customer.name,
      label: opportunity.name,
      expectedCloseDate: opportunity.expected_close_date,
      estimatedAmountHtCents: moneyCents(opportunity.estimated_amount_ht_cents),
      probabilityBasisPoints: opportunity.probability_basis_points,
      status: opportunity.status,
      convertedEngagementId: opportunity.converted_engagement_id,
    })),
    recurringCashflows: recurring.map((expense) => ({
      id: expense.id,
      direction: expense.direction,
      cashflowKind: expense.cashflow_kind,
      label: expense.label,
      amountCents: moneyCents(expense.amount_cents),
      frequency: expense.frequency,
      dayOfMonth: expense.day_of_month,
      startDate: expense.start_date,
      endDate: expense.end_date,
      certainty: expense.certainty,
      probabilityBasisPoints: expense.probability_basis_points,
      active: expense.active,
    })),
    plannedCashflows: planned.map((expense) => ({
      id: expense.id,
      direction: expense.direction,
      cashflowKind: expense.cashflow_kind,
      label: expense.label,
      amountCents: moneyCents(expense.amount_cents),
      plannedDate: expense.planned_date,
      certainty: expense.certainty,
      probabilityBasisPoints: expense.probability_basis_points,
      status: expense.status,
    })),
  };
}

export function businessDateForTimezone(timezone: string, now = new Date()): LocalDate {
  return localDate(new Intl.DateTimeFormat("sv-SE", { timeZone: timezone }).format(now));
}

function addDays(date: LocalDate, days: number): LocalDate {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return localDate(result.toISOString().slice(0, 10));
}

export type DashboardSearchParameters = Record<string, string | string[] | undefined>;

export async function getDashboardViewModel(
  ownerUserId: string,
  options: {
    searchParameters?: DashboardSearchParameters;
    today?: LocalDate;
    bankingSnapshot?: BankingSnapshot;
  } = {},
): Promise<DashboardViewModel> {
  const parsedOwnerId = parseOwnerId(ownerUserId);
  const client = await createClient();
  const settings = await repositories.getOwnerSettings(client, parsedOwnerId);
  const today = options.today ?? businessDateForTimezone(settings.timezone);
  const dashboardOptions = resolveDashboardOptions(
    options.searchParameters ?? {},
    {
      horizonDays: settings.default_forecast_horizon_days,
      scenario: settings.default_scenario,
    },
    today,
  );
  const range = {
    startDate: today,
    endDate: addDays(today, dashboardOptions.horizonDays),
  };
  const data = await loadDashboardSourceData(
    client,
    parsedOwnerId,
    range,
    repositories,
    settings,
    options.bankingSnapshot,
  );

  return buildDashboardViewModel(data, dashboardOptions);
}
