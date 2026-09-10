import { render, screen } from "@testing-library/react";
import { localDate, moneyCents } from "@fc/shared";
import { afterAll, beforeEach, expect, it, vi } from "vitest";

import type { DashboardViewModel } from "@/features/dashboard/view-model";

const { getDashboardViewModel, requireOwner } = vi.hoisted(() => ({
  getDashboardViewModel: vi.fn(),
  requireOwner: vi.fn(),
}));

vi.mock("@/features/dashboard/query", () => ({ getDashboardViewModel }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner }));

class ResizeObserverStub implements ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);
afterAll(() => vi.unstubAllGlobals());

function model(): DashboardViewModel {
  return {
    currency: "EUR",
    today: localDate("2026-09-05"),
    horizonDays: 90,
    scenario: "certain",
    inclusions: {
      invoices: true,
      expenses: true,
      signedOrders: false,
      weightedOpportunities: false,
    },
    openingBalanceCents: moneyCents(4_238_000),
    openingBalanceAsOf: localDate("2026-09-05"),
    safetyThresholdCents: moneyCents(2_000_000),
    kpis: {
      currentBalanceCents: moneyCents(4_238_000),
      availableBalanceCents: moneyCents(3_118_000),
      inflows30DaysCents: moneyCents(1_080_000),
      outflows30DaysCents: moneyCents(1_173_000),
      projected30DaysCents: moneyCents(4_145_000),
      runwayDays: 69,
    },
    chart: {
      points: [{
        date: localDate("2026-09-05"),
        certainBalanceCents: moneyCents(4_238_000),
        committedBalanceCents: moneyCents(4_238_000),
        probableBalanceCents: moneyCents(4_238_000),
        safetyThresholdCents: moneyCents(2_000_000),
      }],
      riskDate: localDate("2026-11-13"),
      summary: "Le scénario certain passe sous le seuil de sécurité le 2026-11-13.",
    },
    overdueInvoices: [],
    itemsToInvoice: [],
    upcomingInflows: [],
    upcomingOutflows: [],
    treasuryEvents: [],
  };
}

beforeEach(() => {
  requireOwner.mockResolvedValue({ userId: "11111111-1111-4111-8111-111111111111" });
  getDashboardViewModel.mockResolvedValue(model());
});

it("renders the real-data dashboard hierarchy and linkable controls", async () => {
  const { default: DashboardPage } = await import("./page");
  render(await DashboardPage({
    searchParams: Promise.resolve({ horizon: "90", scenario: "certain" }),
  }));

  expect(screen.getByRole("heading", { name: "Bonjour" })).toBeInTheDocument();
  expect(screen.getByText("samedi 5 septembre 2026")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Indicateurs de trésorerie" })).toBeInTheDocument();
  const scenarioControls = screen.getByRole("radio", { name: "Facturé" }).closest("form")!;
  const chart = screen.getByRole("img", { name: "Projection de trésorerie" });
  expect(scenarioControls.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("heading", { name: "À traiter" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "90 j" })).toHaveAttribute("aria-current", "page");
});
