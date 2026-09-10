import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { localDate, moneyCents } from "@fc/shared";
import { afterAll, describe, expect, it, vi } from "vitest";

import { ActionList } from "./action-list";
import {
  CashflowChart,
  formatCashflowChartTick,
  formatCashflowChartTooltipLabel,
} from "./cashflow-chart";
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

const scenarioHelp = [
  {
    label: "Facturé",
    description: "Factures émises restant à encaisser; les sorties certaines continuent d’être prises en compte dans la trésorerie.",
  },
  {
    label: "Commandes signées",
    description: "Facturé plus les facturations planifiées des commandes signées; les opportunités sont exclues.",
  },
  {
    label: "Pipeline pondéré",
    description: "Commandes signées plus les opportunités ouvertes pondérées par leur probabilité (exemple : 10 000 € à 60 % compte pour 6 000 €).",
  },
] as const;

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
    expect(within(strip).getByText("Facturé")).toBeInTheDocument();
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

  it("offers named scenarios with accessible explanations", () => {
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
    expect(screen.getByRole("radio", { name: "Facturé" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Facturé" }).closest("form")).toHaveFormValues({
      scenario: "certain",
    });
    expect(screen.getByRole("radio", { name: "Facturé" })).toHaveAccessibleDescription(
      "Factures émises restant à encaisser; les sorties certaines continuent d’être prises en compte dans la trésorerie.",
    );
    expect(screen.getByRole("radio", { name: "Commandes signées" })).toHaveAccessibleDescription(
      "Facturé plus les facturations planifiées des commandes signées; les opportunités sont exclues.",
    );
    expect(screen.getByRole("radio", { name: "Pipeline pondéré" })).toHaveAccessibleDescription(
      "Commandes signées plus les opportunités ouvertes pondérées par leur probabilité (exemple : 10 000 € à 60 % compte pour 6 000 €).",
    );
    expect(screen.queryByRole("button", { name: "Mettre à jour" })).not.toBeInTheDocument();
  });

  it("shows each scenario help while its choice is hovered", () => {
    render(
      <ScenarioControls
        horizonDays={90}
        scenario="certain"
        inclusions={inclusions}
      />,
    );

    for (const { description } of scenarioHelp) {
      const tooltip = screen.getByText(description);

      expect(tooltip).not.toBeVisible();
      fireEvent.mouseEnter(tooltip.parentElement!);
      expect(tooltip).toBeVisible();
      fireEvent.mouseLeave(tooltip.parentElement!);
      expect(tooltip).not.toBeVisible();
    }
  });

  it("keeps each scenario help open while the pointer enters its text", () => {
    render(
      <ScenarioControls
        horizonDays={90}
        scenario="certain"
        inclusions={inclusions}
      />,
    );

    for (const { label, description } of scenarioHelp) {
      const radio = screen.getByRole("radio", { name: label });
      const tooltip = screen.getByText(description);
      const choice = tooltip.parentElement!;

      fireEvent.mouseEnter(radio.closest("label")!);
      fireEvent.mouseLeave(radio.closest("label")!, { relatedTarget: tooltip });
      fireEvent.mouseEnter(tooltip, { relatedTarget: radio });

      expect(tooltip).toBeVisible();
      fireEvent.mouseLeave(choice);
      expect(tooltip).not.toBeVisible();
    }
  });

  it("shows each scenario help while its choice has keyboard focus", () => {
    render(
      <ScenarioControls
        horizonDays={90}
        scenario="certain"
        inclusions={inclusions}
      />,
    );

    for (const { label, description } of scenarioHelp) {
      const radio = screen.getByRole("radio", { name: label });
      const tooltip = screen.getByText(description);

      expect(tooltip).not.toBeVisible();
      fireEvent.focus(radio);
      expect(tooltip).toBeVisible();
      fireEvent.blur(radio);
      expect(tooltip).not.toBeVisible();
    }
  });

  it("closes focused scenario help with Escape and reopens it after refocus", () => {
    render(
      <ScenarioControls
        horizonDays={90}
        scenario="certain"
        inclusions={inclusions}
      />,
    );

    for (const { label, description } of scenarioHelp) {
      const radio = screen.getByRole("radio", { name: label });
      const tooltip = screen.getByText(description);

      act(() => radio.focus());
      expect(tooltip).toBeVisible();
      fireEvent.keyDown(radio, { key: "Escape" });
      expect(tooltip).not.toBeVisible();
      expect(radio).toHaveFocus();
      act(() => radio.blur());
      act(() => radio.focus());
      expect(tooltip).toBeVisible();
      act(() => radio.blur());
    }
  });

  it("submits each scenario's stable GET value automatically", () => {
    render(
      <ScenarioControls
        horizonDays={90}
        scenario="certain"
        inclusions={inclusions}
      />,
    );

    const form = screen.getByRole("radio", { name: "Facturé" }).closest("form")!;
    const submittedScenarios: string[] = [];
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submittedScenarios.push(String(new FormData(form).get("scenario")));
    });

    fireEvent.click(screen.getByRole("radio", { name: "Commandes signées" }));
    fireEvent.click(screen.getByRole("radio", { name: "Pipeline pondéré" }));
    fireEvent.click(screen.getByRole("radio", { name: "Facturé" }));

    expect(submittedScenarios).toEqual(["committed", "probable", "certain"]);
    expect(new FormData(form).get("horizon")).toBe("90");
    expect(new FormData(form).get("filters")).toBe("1");
  });

  it("submits unchecked and restored inclusions in the GET payload", () => {
    render(
      <ScenarioControls
        horizonDays={90}
        scenario="certain"
        inclusions={inclusions}
      />,
    );

    const form = screen.getByRole("radio", { name: "Facturé" }).closest("form")!;
    const payloads: FormData[] = [];
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      payloads.push(new FormData(form));
    });

    const invoices = screen.getByRole("checkbox", { name: "Factures émises" });
    fireEvent.click(invoices);
    fireEvent.click(invoices);

    expect(payloads[0]?.get("invoices")).toBeNull();
    expect(payloads[1]?.get("invoices")).toBe("1");
    for (const payload of payloads) {
      expect(payload.get("scenario")).toBe("certain");
      expect(payload.get("horizon")).toBe("90");
      expect(payload.get("filters")).toBe("1");
    }
  });
});

describe("dashboard detail panels", () => {
  it("formats cashflow chart ticks as French short dates", () => {
    expect(formatCashflowChartTick(localDate("2026-12-31"))).toBe("31/12");
  });

  it("formats cashflow chart tooltip labels as French short dates", () => {
    expect(formatCashflowChartTooltipLabel(localDate("2026-12-31"))).toBe("Date : 31/12");
  });

  it("exposes a textual chart legend and accessible risk summary", () => {
    render(
      <CashflowChart
        currency="EUR"
        horizonDays={90}
        scenario="certain"
        chart={{
          points: [{
            date: localDate("2026-09-05"),
            certainBalanceCents: moneyCents(4_238_000),
            committedBalanceCents: moneyCents(4_238_000),
            probableBalanceCents: moneyCents(4_238_000),
            safetyThresholdCents: moneyCents(2_000_000),
          }],
          riskDate: localDate("2026-11-13"),
          summary: "Une copie de résumé obsolète ne doit pas être affichée.",
        }}
      />,
    );

    const chart = screen.getByRole("img", { name: "Projection de trésorerie" });
    expect(chart).toHaveAccessibleDescription(
      "Facturé · passe sous le seuil de sécurité le 13/11.",
    );
    expect(chart.querySelector(".recharts-responsive-container")).toHaveStyle({
      minWidth: "0",
      width: "100%",
    });
    const legend = screen.getByRole("list", { name: "Légende du graphique" });
    expect(within(legend).getByText("Facturé")).toBeInTheDocument();
    expect(within(legend).getByText("Commandes signées")).toBeInTheDocument();
    expect(within(legend).getByText("Pipeline pondéré")).toBeInTheDocument();
    expect(screen.getByText("Seuil de sécurité")).toBeInTheDocument();
  });

  it("builds the safe chart summary from the structured horizon", () => {
    render(
      <CashflowChart
        currency="EUR"
        horizonDays={180}
        scenario="probable"
        chart={{
          points: [{
            date: localDate("2026-09-05"),
            certainBalanceCents: moneyCents(4_238_000),
            committedBalanceCents: moneyCents(4_238_000),
            probableBalanceCents: moneyCents(4_238_000),
            safetyThresholdCents: moneyCents(2_000_000),
          }],
          riskDate: null,
          summary: "Une copie de résumé obsolète ne doit pas être affichée.",
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "Projection de trésorerie" })).toHaveAccessibleDescription(
      "Pipeline pondéré · reste au-dessus du seuil sur 180 jours.",
    );
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

  it("renders invoiceable schedule dates in French short format", () => {
    render(
      <ActionList
        overdueInvoices={[]}
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

    expect(screen.getByText("CMD-001 · prévu le 15/09")).toBeInTheDocument();
  });

  it("shows upcoming inflows and outflows in separate named regions", () => {
    render(
      <UpcomingLists
        inflows={[event("invoice-1", "inflow", 600_000)]}
        outflows={[event("reserve-1", "outflow", 510_000)]}
        state={{
          horizonDays: 90,
          scenario: "probable",
          inclusions: {
            invoices: false,
            expenses: true,
            signedOrders: false,
            weightedOpportunities: true,
          },
        }}
      />,
    );

    expect(within(screen.getByRole("region", { name: "Prochaines entrées" })).getByText(
      "Facture Atelier Bleu",
    )).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Prochaines sorties" })).getByText(
      "Réserve TVA",
    )).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "Voir toute la trésorerie →" })) {
      expect(link).toHaveAttribute(
        "href",
        "/cashflow?horizon=90&scenario=probable&filters=1&expenses=1&weightedOpportunities=1",
      );
    }
  });

  it("renders upcoming cashflow dates in French short format", () => {
    render(
      <UpcomingLists
        inflows={[event("invoice-1", "inflow", 600_000)]}
        outflows={[]}
        state={{ horizonDays: 90, scenario: "certain", inclusions }}
      />,
    );

    expect(screen.getByText("20/09 · certain")).toBeInTheDocument();
  });
});

it("labels a Qonto opening balance and its stale publication without changing reserve semantics", () => {
 render(<KpiStrip kpis={{currentBalanceCents:moneyCents(500000),availableBalanceCents:moneyCents(400000),inflows30DaysCents:moneyCents(0),outflows30DaysCents:moneyCents(0),projected30DaysCents:moneyCents(500000),runwayDays:null}} horizonDays={90} scenario="certain" openingBalanceSource="qonto" openingBalanceAsOf="2026-09-10T10:00:00Z" lastBankSyncSucceeded={false} excludedBankCurrencies={["USD"]} />);
 expect(screen.getByText(/Solde Qonto/)).toBeInTheDocument(); expect(screen.getByText(/2026-09-10/)).toBeInTheDocument(); expect(screen.getByText(/actualisation nécessaire/i)).toBeInTheDocument(); expect(screen.getByText(/USD/)).toBeInTheDocument(); expect(screen.queryByText("solde manuel actuel")).not.toBeInTheDocument();
});
