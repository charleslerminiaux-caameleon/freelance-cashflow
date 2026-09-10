import type { SupabaseClient } from "@supabase/supabase-js";
import { localDate } from "@fc/shared";
import { describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient }));

import {
  businessDateForTimezone,
  getDashboardViewModel,
  loadDashboardSourceData,
  readAllPages,
  type DashboardRepositoryAdapter,
} from "./query";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const engagementId = "33333333-3333-4333-8333-333333333333";
const expectedRange = {
  startDate: localDate("2026-09-05"),
  endDate: localDate("2026-12-04"),
};

function requireExpectedRange(range: { startDate: string; endDate: string }) {
  if (range.startDate !== expectedRange.startDate || range.endDate !== expectedRange.endDate) {
    throw new Error("Unexpected dashboard range");
  }
}

describe("readAllPages", () => {
  it("returns rows beyond the Supabase API maximum page size", async () => {
    const rows = Array.from({ length: 2_005 }, (_, index) => ({ id: index + 1 }));

    const result = await readAllPages(
      async (from, to) => rows.slice(from, to + 1),
      1_000,
    );

    expect(result).toHaveLength(2_005);
    expect(result[1_000]).toEqual({ id: 1_001 });
    expect(result.at(-1)).toEqual({ id: 2_005 });
  });
});

describe("businessDateForTimezone", () => {
  it("uses the Europe/Paris business day across the daylight-saving boundary", () => {
    expect(businessDateForTimezone(
      "Europe/Paris",
      new Date("2026-03-28T23:30:00.000Z"),
    )).toBe("2026-03-29");
  });
});

function repositoryAdapter(): DashboardRepositoryAdapter {
  return {
    getBankingSnapshot: async () => ({ integration: null, accounts: [] }),
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
    listRelevantInvoices: async (_client, _ownerId, range) => {
      requireExpectedRange(range);
      return [{
      id: "44444444-4444-4444-8444-444444444444",
      owner_user_id: ownerUserId,
      billing_schedule_item_id: null,
      invoice_number: "F-001",
      issued_at: localDate("2026-09-01"),
      due_at: localDate("2026-09-15"),
      expected_payment_date: localDate("2026-09-20"),
      amount_ttc_cents: 120_000,
      paid_amount_cents: 20_000,
      status: "partially_paid",
      customer: { name: "Atelier Bleu" },
      }];
    },
    listRelevantOpportunities: async (_client, _ownerId, range) => {
      requireExpectedRange(range);
      return [{
      id: "55555555-5555-4555-8555-555555555555",
      owner_user_id: ownerUserId,
      name: "Mission automne",
      status: "proposal",
      estimated_amount_ht_cents: 500_000,
      probability_basis_points: 4_000,
      expected_close_date: localDate("2026-10-01"),
      converted_engagement_id: null,
      customer: { name: "Atelier Bleu" },
      }];
    },
    listRelevantBillingScheduleItems: async (_client, _ownerId, range) => {
      requireExpectedRange(range);
      return [{
      id: "66666666-6666-4666-8666-666666666666",
      owner_user_id: ownerUserId,
      engagement_id: engagementId,
      label: "Acompte",
      planned_invoice_date: localDate("2026-09-10"),
      amount_ttc_cents: 120_000,
      expected_payment_date: localDate("2026-10-10"),
      status: "planned",
      engagement: {
        reference: "CMD-001",
        status: "active",
        customer: { name: "Atelier Bleu" },
      },
      }];
    },
    listRelevantRecurringCashflows: async (_client, _ownerId, range) => {
      requireExpectedRange(range);
      return [{
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
      }];
    },
    listRelevantPlannedCashflows: async (_client, _ownerId, range) => {
      requireExpectedRange(range);
      return [{
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
      }];
    },
  };
}

describe("loadDashboardSourceData", () => {
  it("maps owner-scoped repository rows into a complete domain snapshot", async () => {
    const adapter = repositoryAdapter();
    const scheduleRead = vi.spyOn(adapter, "listRelevantBillingScheduleItems");
    const data = await loadDashboardSourceData(
      {} as SupabaseClient,
      ownerUserId,
      expectedRange,
      adapter,
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
    expect(scheduleRead).toHaveBeenCalledOnce();
  });

  it("rejects a malformed owner id before loading financial data", async () => {
    await expect(loadDashboardSourceData(
      {} as SupabaseClient,
      "not-an-owner-id",
      expectedRange,
      repositoryAdapter(),
    )).rejects.toThrow("Invalid owner identifier");
  });
});

it("loads published banking independently of provider configuration and never reads transaction history", async () => {
 const adapter = repositoryAdapter();
 const banking = {integration:{id:ownerUserId,status:"error" as const,last_success_at:"2026-09-10T10:00:00Z",last_connection_succeeded:false,last_error_code:"PROVIDER_AUTH_EXPIRED" as const},accounts:[]};
 adapter.getBankingSnapshot = vi.fn().mockResolvedValue(banking);
 const result = await loadDashboardSourceData({} as SupabaseClient, ownerUserId, expectedRange, adapter);
 expect(result.banking).toEqual(banking); expect(result.settings.manualCurrentBalanceCents).toBe(420000);
 expect(adapter.getBankingSnapshot).toHaveBeenCalledWith({},ownerUserId);
});

it("reuses a caller's validated banking snapshot without a second banking read", async () => {
 const adapter = repositoryAdapter();
 adapter.getBankingSnapshot = vi.fn().mockRejectedValue(new Error("unexpected second read"));
 const banking = { integration: null, accounts: [] };
 const result = await loadDashboardSourceData({} as SupabaseClient, ownerUserId, expectedRange, adapter, undefined, banking);
 expect(result.banking).toBe(banking);
 expect(adapter.getBankingSnapshot).not.toHaveBeenCalled();
});

it("builds the dashboard from the exact supplied snapshot without another publication read", async () => {
  const settings = await repositoryAdapter().getOwnerSettings({} as SupabaseClient, ownerUserId);
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: settings, error: null }),
    range: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  const db = { from: vi.fn(() => query) };
  createClient.mockResolvedValue(db);
  const banking = {
    integration: { id: ownerUserId, status: "connected" as const, last_success_at: "2026-09-10T10:00:00.000002Z", last_connection_succeeded: true, last_error_code: null },
    accounts: [{ id: ownerUserId, name: "Compte exemple", iban_masked: null, currency: "EUR", current_balance_cents: 500000, available_balance_cents: null, status: "active" as const, is_current: true, updated_at: "2026-09-10T10:00:00Z" }],
  };
  const result = await getDashboardViewModel(ownerUserId, { today: expectedRange.startDate, bankingSnapshot: banking });
  expect(result.openingBalanceCents).toBe(500000);
  expect(result.openingBalanceAsOf).toBe(banking.integration.last_success_at);
  expect(db.from.mock.calls.flat()).not.toContain("integrations");
  expect(db.from.mock.calls.flat()).not.toContain("bank_accounts");
  expect(db.from.mock.calls.flat()).not.toContain("bank_transactions");
});
