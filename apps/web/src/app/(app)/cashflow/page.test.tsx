import { render, screen, within } from "@testing-library/react";
import { localDate, moneyCents } from "@fc/shared";
import { beforeEach, expect, it, vi } from "vitest";

import type { DashboardViewModel } from "@/features/dashboard/view-model";

const { getDashboardViewModel, requireOwner, createClient, getBankingSnapshot, listBankTransactions, getOwnerSettings, businessDateForTimezone } = vi.hoisted(() => ({
  getOwnerSettings: vi.fn(), businessDateForTimezone: vi.fn(),
  createClient: vi.fn(), getBankingSnapshot: vi.fn(), listBankTransactions: vi.fn(),
  getDashboardViewModel: vi.fn(),
  requireOwner: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/features/banking/repository", async (original) => ({...await original<typeof import("@/features/banking/repository")>(), getBankingSnapshot, listBankTransactions}));
vi.mock("@/features/dashboard/query", () => ({ getDashboardViewModel, businessDateForTimezone }));
vi.mock("@/features/settings/repository", () => ({ getOwnerSettings }));
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
    timezone: "Europe/Paris",
    bankSyncInProgress: false,
    today: localDate("2026-09-05"),
    horizonDays: 180,
    scenario: "probable",
    inclusions: {
      invoices: true,
      expenses: true,
      signedOrders: true,
      weightedOpportunities: true,
    },
    openingBalanceSource: "manual", excludedBankCurrencies: [], lastBankSyncSucceeded: null,
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
  vi.clearAllMocks();
  getOwnerSettings.mockResolvedValue({ timezone: "Europe/Paris" });
  businessDateForTimezone.mockReturnValue(localDate("2026-09-11"));
  createClient.mockResolvedValue({}); getBankingSnapshot.mockResolvedValue({integration:null,accounts:[],history:{items:[],page:1,hasNext:false}}); listBankTransactions.mockResolvedValue({items:[],page:2,hasNext:false});
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

it("shows retained Qonto source and separate paginated history", async () => {
 const data = model(); data.openingBalanceSource = "qonto"; data.lastBankSyncSucceeded = false; data.excludedBankCurrencies = ["USD"]; getDashboardViewModel.mockResolvedValue(data);
 const banking = {integration:{id:"bank",last_success_at:"2026-09-10T10:00:00Z",last_error_code:"DATABASE_ERROR"},accounts:[],history:{items:[],page:2,hasNext:false}};
 getBankingSnapshot.mockResolvedValue(banking);
 const {default:Page} = await import("./page"); render(await Page({searchParams:Promise.resolve({bankPage:"2"})}));
 expect(screen.getByText(/Situation Qonto/)).toBeInTheDocument(); expect(screen.getByText(/Actualisation nécessaire/)).toBeInTheDocument(); expect(screen.getByRole("table",{name:"Historique bancaire"})).toBeInTheDocument(); expect(screen.getByRole("table",{name:"Événements de trésorerie"})).toBeInTheDocument();
 expect(getOwnerSettings).toHaveBeenCalledWith({},"11111111-1111-4111-8111-111111111111");
 expect(businessDateForTimezone).toHaveBeenCalledWith("Europe/Paris");
 expect(getBankingSnapshot).toHaveBeenCalledTimes(1);
 expect(getBankingSnapshot).toHaveBeenCalledWith({},"11111111-1111-4111-8111-111111111111",{historyPage:2,fullHistory:{since:"2026-03-11",until:"2026-09-11"}});
 expect(getDashboardViewModel).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111",{searchParameters:{bankPage:"2"},today:"2026-09-11",bankingSnapshot:banking});
 expect(getDashboardViewModel.mock.calls[0]?.[1].bankingSnapshot).toBe(banking);
 expect(listBankTransactions).not.toHaveBeenCalled();
});
it("does not read financial rows for nonowner", async () => { requireOwner.mockRejectedValue(new Error("redirect")); const {default:Page} = await import("./page"); await expect(Page({searchParams:Promise.resolve({})})).rejects.toThrow("redirect"); expect(createClient).not.toHaveBeenCalled(); expect(getBankingSnapshot).not.toHaveBeenCalled(); });
