import { fireEvent, render, screen, within } from "@testing-library/react";
import { localDate, moneyCents } from "@fc/shared";
import { afterAll, beforeEach, expect, it, vi } from "vitest";

import type { DashboardViewModel } from "@/features/dashboard/view-model";

const { getDashboardViewModel, requireOwner } = vi.hoisted(() => ({
  getDashboardViewModel: vi.fn(),
  requireOwner: vi.fn(),
}));

vi.mock("@/features/dashboard/query", () => ({ getDashboardViewModel }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner }));

// Keep UI tests outside the server-action/Supabase environment boundary.
vi.mock("@/features/integrations/auto-sync-action", () => ({ autoSyncQontoAction: vi.fn() }));

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
    timezone: "Europe/Paris",
    bankSyncInProgress: false,
    today: localDate("2026-09-05"),
    horizonDays: 90,
    scenario: "certain",
    inclusions: {
      invoices: true,
      expenses: true,
      signedOrders: false,
      weightedOpportunities: false,
    },
    openingBalanceSource: "manual", excludedBankCurrencies: [], lastBankSyncSucceeded: null,
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

  expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  expect(screen.queryByText(/^Bonjour/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Votre trésorerie, aujourd’hui/)).not.toBeInTheDocument();
  const chartPanel = within(screen.getByRole("region", { name: "Solde projeté" }));
  expect(chartPanel.getByRole("navigation", { name: "Horizon de prévision" })).toBeInTheDocument();
  expect(chartPanel.getByText("Projection", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("samedi 5 septembre 2026")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Indicateurs de trésorerie" })).toBeInTheDocument();
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Légende du graphique" })).toHaveTextContent("Facturé + signé + opportunités");
  expect(screen.getByRole("heading", { name: "À traiter" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "90 j" })).toHaveAttribute("aria-current", "page");
});


it("renders the published Qonto balance with owner timezone and another tab's sync progress", async () => {
  const data = model();
  data.openingBalanceSource = "qonto";
  data.openingBalanceAsOf = "2026-09-01T00:30:00Z";
  data.timezone = "America/Los_Angeles";
  data.bankSyncInProgress = true;
  getDashboardViewModel.mockResolvedValue(data);
  const { default: DashboardPage } = await import("./page");
  render(await DashboardPage({searchParams: Promise.resolve({})}));
  const badge = screen.getByRole("button", {name: /Solde Qonto · Synchronisation en cours/});
  fireEvent.focus(badge);
  expect(screen.getByRole("tooltip")).toHaveTextContent("31/08/2026 à 17:30 (America/Los_Angeles)");
  expect(screen.queryByText(/Actualisation nécessaire · données conservées/)).not.toBeInTheDocument();
});

it("keeps the greeting hidden and uses invoiced KPIs even with an old scenario URL", async () => {
  requireOwner.mockResolvedValue({ userId: "owner", firstName: "Camille" });
  const { default: DashboardPage } = await import("./page");
  render(await DashboardPage({ searchParams: Promise.resolve({ scenario: "probable" }) }));
  expect(screen.queryByText(/Bonjour Camille/)).not.toBeInTheDocument();
  expect(getDashboardViewModel).toHaveBeenCalledWith("owner", { searchParameters: { scenario: "certain" } });
});
