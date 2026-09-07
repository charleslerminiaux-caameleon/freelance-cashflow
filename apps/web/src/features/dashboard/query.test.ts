import type { SupabaseClient } from "@supabase/supabase-js";
import { localDate } from "@fc/shared";
import { describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient }));

import {
  loadDashboardSourceData,
  type DashboardRepositoryAdapter,
} from "./query";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";
const engagementId = "33333333-3333-4333-8333-333333333333";

function repositoryAdapter(): DashboardRepositoryAdapter {
  return {
    getOwnerSettings: async () => ({
      singleton_key: true,
      owner_user_id: ownerUserId,
      currency: "EUR",
      timezone: "Europe/Paris",
      country: "FR",
      legal_form: "EI",
      manual_current_balance_cents: 420_000,
      manual_balance_as_of: localDate("2026-09-05"),
      safety_cash_threshold_cents: 200_000,
      default_forecast_horizon_days: 90,
      default_scenario: "committed",
      created_at: "2026-09-01T10:00:00.000Z",
      updated_at: "2026-09-01T10:00:00.000Z",
    }),
    listInvoices: async () => [{
      id: "44444444-4444-4444-8444-444444444444",
      owner_user_id: ownerUserId,
      customer_id: customerId,
      billing_schedule_item_id: null,
      provider: "manual",
      external_id: null,
      invoice_number: "F-001",
      issued_at: localDate("2026-09-01"),
      due_at: localDate("2026-09-15"),
      expected_payment_date: localDate("2026-09-20"),
      amount_ht_cents: 100_000,
      vat_cents: 20_000,
      amount_ttc_cents: 120_000,
      paid_amount_cents: 20_000,
      status: "partially_paid",
      paid_at: null,
      raw_payload_hash: null,
      created_at: "2026-09-01T10:00:00.000Z",
      updated_at: "2026-09-01T10:00:00.000Z",
      customer: { name: "Atelier Bleu" },
    }],
    listOpportunities: async () => [{
      id: "55555555-5555-4555-8555-555555555555",
      owner_user_id: ownerUserId,
      customer_id: customerId,
      name: "Mission automne",
      status: "proposal",
      estimated_amount_ht_cents: 500_000,
      probability_basis_points: 4_000,
      expected_close_date: localDate("2026-10-01"),
      expected_start_date: null,
      expected_end_date: null,
      notes: null,
      converted_engagement_id: null,
      customer: { name: "Atelier Bleu", payment_terms_days: 30 },
    }],
    listEngagements: async () => [{
      id: engagementId,
      owner_user_id: ownerUserId,
      customer_id: customerId,
      opportunity_id: null,
      reference: "CMD-001",
      signed_at: localDate("2026-09-01"),
      start_date: null,
      end_date: null,
      amount_ht_cents: 100_000,
      amount_ttc_cents: 120_000,
      status: "active",
      payment_terms_days: 30,
      customer: { name: "Atelier Bleu" },
    }],
    listBillingScheduleItems: async () => [{
      id: "66666666-6666-4666-8666-666666666666",
      owner_user_id: ownerUserId,
      engagement_id: engagementId,
      label: "Acompte",
      planned_invoice_date: localDate("2026-09-10"),
      amount_ht_cents: 100_000,
      vat_cents: 20_000,
      amount_ttc_cents: 120_000,
      payment_terms_days: 30,
      expected_payment_date: localDate("2026-10-10"),
      status: "planned",
    }],
    listExpenseWorkspace: async () => ({
      categories: [],
      recurringExpenses: [{
        id: "77777777-7777-4777-8777-777777777777",
        owner_user_id: ownerUserId,
        direction: "outflow",
        cashflow_kind: "expense",
        label: "Loyer",
        category_id: null,
        amount_cents: 90_000,
        frequency: "monthly",
        day_of_month: 30,
        start_date: localDate("2026-09-01"),
        end_date: null,
        certainty: "certain",
        probability_basis_points: 10_000,
        active: true,
        created_at: "2026-09-01T10:00:00.000Z",
        updated_at: "2026-09-01T10:00:00.000Z",
      }],
      plannedExpenses: [{
        id: "88888888-8888-4888-8888-888888888888",
        owner_user_id: ownerUserId,
        direction: "outflow",
        cashflow_kind: "reserve",
        label: "TVA",
        amount_cents: 50_000,
        planned_date: localDate("2026-09-22"),
        category_id: null,
        certainty: "committed",
        probability_basis_points: 10_000,
        status: "planned",
        created_at: "2026-09-01T10:00:00.000Z",
        updated_at: "2026-09-01T10:00:00.000Z",
      }],
    }),
  };
}

describe("loadDashboardSourceData", () => {
  it("maps owner-scoped repository rows into a complete domain snapshot", async () => {
    const data = await loadDashboardSourceData(
      {} as SupabaseClient,
      ownerUserId,
      repositoryAdapter(),
    );

    expect(data.settings).toEqual({
      currency: "EUR",
      timezone: "Europe/Paris",
      manualCurrentBalanceCents: 420_000,
      manualBalanceAsOf: "2026-09-05",
      safetyThresholdCents: 200_000,
      defaultForecastHorizonDays: 90,
      defaultScenario: "committed",
    });
    expect(data.invoices[0]).toMatchObject({
      id: "44444444-4444-4444-8444-444444444444",
      label: "F-001 · Atelier Bleu",
      amountTtcCents: 120_000,
      paidAmountCents: 20_000,
    });
    expect(data.billingScheduleItems[0]).toMatchObject({
      engagementId,
      engagementReference: "CMD-001",
      customerName: "Atelier Bleu",
      engagementStatus: "active",
    });
    expect(data.opportunities[0]).toMatchObject({
      label: "Mission automne",
      probabilityBasisPoints: 4_000,
    });
    expect(data.recurringCashflows[0]).toMatchObject({
      cashflowKind: "expense",
      amountCents: 90_000,
    });
    expect(data.plannedCashflows[0]).toMatchObject({
      cashflowKind: "reserve",
      plannedDate: "2026-09-22",
    });
  });

  it("rejects a malformed owner id before loading financial data", async () => {
    await expect(loadDashboardSourceData(
      {} as SupabaseClient,
      "not-an-owner-id",
      repositoryAdapter(),
    )).rejects.toThrow("Invalid owner identifier");
  });
});
