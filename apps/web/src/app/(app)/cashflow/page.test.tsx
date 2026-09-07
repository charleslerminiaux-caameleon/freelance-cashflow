import { render, screen, within } from "@testing-library/react";
import { localDate, moneyCents } from "@fc/shared";
import { beforeEach, expect, it, vi } from "vitest";

import type { DashboardViewModel } from "@/features/dashboard/view-model";

const { getDashboardViewModel, requireOwner } = vi.hoisted(() => ({
  getDashboardViewModel: vi.fn(),
  requireOwner: vi.fn(),
}));

vi.mock("@/features/dashboard/query", () => ({ getDashboardViewModel }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner }));

function model(): DashboardViewModel {
  const event = {
    id: "invoice:invoice-1:2026-09-20",
    direction: "inflow" as const,
    sourceType: "invoice" as const,
    sourceId: "invoice-1",
    label: "F-001 · Atelier Bleu",
    amountCents: moneyCents(600_000),
    plannedDate: localDate("2026-09-20"),
    certainty: "certain" as const,
    probabilityBasisPoints: 10_000,
    isActual: false,
    runningBalanceCents: moneyCents(4_838_000),
  };
  return {
    currency: "EUR",
    today: localDate("2026-09-05"),
    horizonDays: 180,
    scenario: "probable",
    inclusions: {
      invoices: true,
      expenses: true,
      signedOrders: true,
      weightedOpportunities: true,
    },
    openingBalanceCents: moneyCents(4_238_000),
    openingBalanceAsOf: localDate("2026-09-05"),
    safetyThresholdCents: moneyCents(2_000_000),
    kpis: {
      currentBalanceCents: moneyCents(4_238_000),
      availableBalanceCents: moneyCents(4_238_000),
      inflows30DaysCents: moneyCents(600_000),
      outflows30DaysCents: moneyCents(0),
      projected30DaysCents: moneyCents(4_838_000),
      runwayDays: null,
    },
    chart: { points: [], riskDate: null, summary: "Projection sûre." },
    overdueInvoices: [],
    itemsToInvoice: [],
    upcomingInflows: [event],
    upcomingOutflows: [],
    treasuryEvents: [event],
  };
}

beforeEach(() => {
  requireOwner.mockResolvedValue({ userId: "11111111-1111-4111-8111-111111111111" });
  getDashboardViewModel.mockResolvedValue(model());
});

it("renders opening balance and explainable chronological forecast events", async () => {
  const { default: CashflowPage } = await import("./page");
  render(await CashflowPage({
    searchParams: Promise.resolve({ horizon: "180", scenario: "probable" }),
  }));

  expect(screen.getByRole("heading", { name: "Trésorerie" })).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Point de départ de la projection" })).getByText(
    (_, element) => element?.tagName === "STRONG" && element.textContent === "42 380,00 €",
  )).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "6 mois" })).toHaveAttribute("aria-current", "page");
  const table = screen.getByRole("table", { name: "Événements de trésorerie" });
  const row = within(table).getByRole("row", { name: /F-001 · Atelier Bleu/ });
  expect(within(row).getByText("Facture")).toBeInTheDocument();
  expect(within(row).getByText("Certain")).toBeInTheDocument();
  expect(within(row).getByText((_, element) =>
    element?.getAttribute("data-label") === "Montant" && element.textContent === "+6 000,00 €",
  )).toBeInTheDocument();
  expect(within(row).getByText((_, element) =>
    element?.tagName === "STRONG" && element.textContent === "48 380,00 €",
  )).toBeInTheDocument();
});
