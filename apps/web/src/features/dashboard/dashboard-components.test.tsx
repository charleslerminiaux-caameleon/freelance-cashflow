import { render, screen, within } from "@testing-library/react";
import { localDate, moneyCents } from "@fc/shared";
import { afterAll, describe, expect, it, vi } from "vitest";

import { ActionList } from "./action-list";
import { CashflowChart } from "./cashflow-chart";
import { HorizonSelector } from "./horizon-selector";
import { KpiStrip } from "./kpi-strip";
import { ScenarioControls } from "./scenario-controls";
import { UpcomingLists } from "./upcoming-lists";
import type { DashboardInclusions, DashboardTreasuryEvent } from "./view-model";

class ResizeObserverStub implements ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);
afterAll(() => vi.unstubAllGlobals());

const inclusions: DashboardInclusions = {
  invoices: true,
  expenses: true,
  signedOrders: false,
  weightedOpportunities: false,
};

function event(
  id: string,
  direction: "inflow" | "outflow",
  amountCents: number,
): DashboardTreasuryEvent {
  return {
    id,
    direction,
    sourceType: direction === "inflow" ? "invoice" : "reserve",
    sourceId: id,
    label: direction === "inflow" ? "Facture Atelier Bleu" : "Réserve TVA",
    amountCents: moneyCents(amountCents),
    plannedDate: localDate("2026-09-20"),
    certainty: "certain",
    probabilityBasisPoints: 10_000,
    isActual: false,
    runningBalanceCents: moneyCents(4_000_000),
  };
}

describe("dashboard controls", () => {
  it("renders six real-data KPIs including a bounded runway", () => {
    render(
      <KpiStrip
        kpis={{
          currentBalanceCents: moneyCents(4_238_000),
          availableBalanceCents: moneyCents(3_118_000),
          inflows30DaysCents: moneyCents(1_080_000),
          outflows30DaysCents: moneyCents(1_173_000),
          projected30DaysCents: moneyCents(4_145_000),
          runwayDays: 69,
        }}
        horizonDays={90}
        scenario="certain"
      />,
    );

    const strip = screen.getByRole("region", { name: "Indicateurs de trésorerie" });
    expect(within(strip).getAllByRole("article")).toHaveLength(6);
    expect(within(strip).getByText((_, element) =>
      element?.tagName === "STRONG" && element.textContent === "42 380,00 €",
    )).toBeInTheDocument();
    expect(within(strip).getByText("69 jours")).toBeInTheDocument();
  });

  it("keeps scenario and inclusions in linkable horizon URLs", () => {
    render(
      <HorizonSelector
        basePath="/cashflow"
        horizonDays={90}
        scenario="committed"
        inclusions={inclusions}
      />,
    );

    expect(screen.getByRole("link", { name: "6 mois" })).toHaveAttribute(
      "href",
      "/cashflow?horizon=180&scenario=committed&filters=1&invoices=1&expenses=1",
    );
    expect(screen.getByRole("link", { name: "90 j" })).toHaveAttribute("aria-current", "page");
  });

  it("submits an explicit filter marker so unchecked sources remain excluded", () => {
    render(
      <ScenarioControls
        horizonDays={90}
        scenario="certain"
        inclusions={inclusions}
      />,
    );

    expect(document.querySelector('input[name="filters"]')).toHaveValue("1");
    expect(screen.getByRole("checkbox", { name: "Factures émises" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Commandes signées" })).not.toBeChecked();
    expect(screen.getByLabelText("Scénario")).toHaveValue("certain");
  });
});

describe("dashboard detail panels", () => {
  it("exposes a textual chart legend and accessible risk summary", () => {
    render(
      <CashflowChart
        currency="EUR"
        chart={{
          points: [{
            date: localDate("2026-09-05"),
            certainBalanceCents: moneyCents(4_238_000),
            committedBalanceCents: moneyCents(4_238_000),
            probableBalanceCents: moneyCents(4_238_000),
            safetyThresholdCents: moneyCents(2_000_000),
          }],
          riskDate: null,
          summary: "Le scénario certain reste au-dessus du seuil sur 90 jours.",
        }}
      />,
    );

    const chart = screen.getByRole("img", { name: "Projection de trésorerie" });
    expect(chart).toHaveAccessibleDescription(
      "Le scénario certain reste au-dessus du seuil sur 90 jours.",
    );
    expect(screen.getByText("Certain")).toBeInTheDocument();
    expect(screen.getByText("Engagé")).toBeInTheDocument();
    expect(screen.getByText("Probable pondéré")).toBeInTheDocument();
    expect(screen.getByText("Seuil de sécurité")).toBeInTheDocument();
  });

  it("links overdue invoices and invoiceable schedules to their work screens", () => {
    render(
      <ActionList
        overdueInvoices={[{
          id: "invoice-1",
          invoiceNumber: "F-001",
          customerName: "Atelier Bleu",
          dueAt: localDate("2026-08-27"),
          remainingCents: moneyCents(480_000),
          daysOverdue: 9,
        }]}
        itemsToInvoice={[{
          id: "schedule-1",
          engagementId: "engagement-1",
          label: "Acompte",
          engagementReference: "CMD-001",
          customerName: "Studio Vermeil",
          plannedInvoiceDate: localDate("2026-09-15"),
          amountCents: moneyCents(300_000),
        }]}
      />,
    );

    expect(screen.getByRole("link", { name: /Relancer Atelier Bleu/ })).toHaveAttribute(
      "href",
      "/invoices/invoice-1",
    );
    expect(screen.getByRole("link", { name: /Facturer Studio Vermeil/ })).toHaveAttribute(
      "href",
      "/engagements/engagement-1",
    );
  });

  it("shows upcoming inflows and outflows in separate named regions", () => {
    render(
      <UpcomingLists
        inflows={[event("invoice-1", "inflow", 600_000)]}
        outflows={[event("reserve-1", "outflow", 510_000)]}
      />,
    );

    expect(within(screen.getByRole("region", { name: "Prochaines entrées" })).getByText(
      "Facture Atelier Bleu",
    )).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Prochaines sorties" })).getByText(
      "Réserve TVA",
    )).toBeInTheDocument();
  });
});
