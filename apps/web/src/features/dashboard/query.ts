import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { localDate, moneyCents, type LocalDate } from "@fc/shared";
import { z } from "zod";

import {
  listBillingScheduleItems,
  listEngagements,
  type BillingScheduleItem,
  type Engagement,
} from "@/features/engagements/repository";
import {
  listExpenseWorkspace,
  type ExpenseWorkspace,
} from "@/features/expenses/repository";
import { listInvoices, type Invoice } from "@/features/invoices/repository";
import {
  listOpportunities,
  type Opportunity,
} from "@/features/opportunities/repository";
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

export type DashboardRepositoryAdapter = {
  getOwnerSettings: (client: SupabaseClient, ownerUserId: string) => Promise<OwnerSettings>;
  listInvoices: (client: SupabaseClient, ownerUserId: string) => Promise<Invoice[]>;
  listOpportunities: (client: SupabaseClient, ownerUserId: string) => Promise<Opportunity[]>;
  listEngagements: (client: SupabaseClient, ownerUserId: string) => Promise<Engagement[]>;
  listBillingScheduleItems: (
    client: SupabaseClient,
    ownerUserId: string,
    engagementId: string,
  ) => Promise<BillingScheduleItem[]>;
  listExpenseWorkspace: (
    client: SupabaseClient,
    ownerUserId: string,
  ) => Promise<ExpenseWorkspace>;
};

const repositories: DashboardRepositoryAdapter = {
  getOwnerSettings,
  listInvoices,
  listOpportunities,
  listEngagements,
  listBillingScheduleItems,
  listExpenseWorkspace,
};

const ownerIdSchema = z.string().uuid();

export async function loadDashboardSourceData(
  client: SupabaseClient,
  ownerUserId: string,
  adapter: DashboardRepositoryAdapter = repositories,
): Promise<DashboardSourceData> {
  const parsedOwnerId = ownerIdSchema.safeParse(ownerUserId);
  if (!parsedOwnerId.success) throw new Error("Invalid owner identifier");

  const [settings, invoices, opportunities, engagements, expenseWorkspace] = await Promise.all([
    adapter.getOwnerSettings(client, parsedOwnerId.data),
    adapter.listInvoices(client, parsedOwnerId.data),
    adapter.listOpportunities(client, parsedOwnerId.data),
    adapter.listEngagements(client, parsedOwnerId.data),
    adapter.listExpenseWorkspace(client, parsedOwnerId.data),
  ]);
  const schedulesByEngagement = await Promise.all(
    engagements.map(async (engagement) => ({
      engagement,
      scheduleItems: await adapter.listBillingScheduleItems(
        client,
        parsedOwnerId.data,
        engagement.id,
      ),
    })),
  );

  return {
    settings: {
      currency: settings.currency,
      timezone: settings.timezone,
      manualCurrentBalanceCents: moneyCents(settings.manual_current_balance_cents),
      manualBalanceAsOf: localDate(settings.manual_balance_as_of),
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
      issuedAt: localDate(invoice.issued_at),
      dueAt: localDate(invoice.due_at),
      expectedPaymentDate: localDate(invoice.expected_payment_date),
      amountTtcCents: moneyCents(invoice.amount_ttc_cents),
      paidAmountCents: moneyCents(invoice.paid_amount_cents),
      status: invoice.status,
    })),
    billingScheduleItems: schedulesByEngagement.flatMap(({ engagement, scheduleItems }) =>
      scheduleItems.map((item) => ({
        id: item.id,
        engagementId: engagement.id,
        engagementReference: engagement.reference,
        customerName: engagement.customer.name,
        label: item.label,
        plannedInvoiceDate: localDate(item.planned_invoice_date),
        expectedPaymentDate: localDate(item.expected_payment_date),
        amountTtcCents: moneyCents(item.amount_ttc_cents),
        status: item.status,
        engagementStatus: engagement.status,
      })),
    ),
    opportunities: opportunities.map((opportunity) => ({
      id: opportunity.id,
      customerName: opportunity.customer.name,
      label: opportunity.name,
      expectedCloseDate: opportunity.expected_close_date === null
        ? null
        : localDate(opportunity.expected_close_date),
      estimatedAmountHtCents: moneyCents(opportunity.estimated_amount_ht_cents),
      probabilityBasisPoints: opportunity.probability_basis_points,
      status: opportunity.status,
      convertedEngagementId: opportunity.converted_engagement_id,
    })),
    recurringCashflows: expenseWorkspace.recurringExpenses.map((expense) => ({
      id: expense.id,
      direction: expense.direction,
      cashflowKind: expense.cashflow_kind,
      label: expense.label,
      amountCents: moneyCents(expense.amount_cents),
      frequency: expense.frequency,
      dayOfMonth: expense.day_of_month,
      startDate: localDate(expense.start_date),
      endDate: expense.end_date === null ? null : localDate(expense.end_date),
      certainty: expense.certainty,
      probabilityBasisPoints: expense.probability_basis_points,
      active: expense.active,
    })),
    plannedCashflows: expenseWorkspace.plannedExpenses.map((expense) => ({
      id: expense.id,
      direction: expense.direction,
      cashflowKind: expense.cashflow_kind,
      label: expense.label,
      amountCents: moneyCents(expense.amount_cents),
      plannedDate: localDate(expense.planned_date),
      certainty: expense.certainty,
      probabilityBasisPoints: expense.probability_basis_points,
      status: expense.status,
    })),
  };
}

export function businessDateForTimezone(timezone: string, now = new Date()): LocalDate {
  return localDate(new Intl.DateTimeFormat("sv-SE", { timeZone: timezone }).format(now));
}

export type DashboardSearchParameters = Record<string, string | string[] | undefined>;

export async function getDashboardViewModel(
  ownerUserId: string,
  options: {
    searchParameters?: DashboardSearchParameters;
    today?: LocalDate;
  } = {},
): Promise<DashboardViewModel> {
  const client = await createClient();
  const data = await loadDashboardSourceData(client, ownerUserId);
  const today = options.today ?? businessDateForTimezone(data.settings.timezone);
  const dashboardOptions = resolveDashboardOptions(
    options.searchParameters ?? {},
    {
      horizonDays: data.settings.defaultForecastHorizonDays,
      scenario: data.settings.defaultScenario,
    },
    today,
  );

  return buildDashboardViewModel(data, dashboardOptions);
}
