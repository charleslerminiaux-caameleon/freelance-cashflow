import { fireEvent, render, screen } from "@testing-library/react";

import {
  ConversionForm,
  DeleteOpportunityForm,
  OpportunityForm,
} from "./opportunity-form";

const idleAction = async () => ({ message: null, success: false });

it("collects the customer, commercial amount, probability and business dates", () => {
  render(
    <OpportunityForm
      action={idleAction}
      customers={[{ id: "customer-1", name: "Atelier Atlas" }]}
    />,
  );

  expect(screen.getByLabelText("Client")).toHaveValue("customer-1");
  expect(screen.getByLabelText("Montant HT")).toHaveAttribute("inputmode", "decimal");
  expect(screen.getByLabelText("Probabilité (%)")).toHaveAttribute("inputmode", "decimal");
  expect(screen.getByLabelText("Date de clôture prévue")).toHaveAttribute("type", "date");
  expect(screen.queryByRole("option", { name: "Gagnée" })).toBeNull();
  expect(screen.getByRole("button", { name: "Créer l’opportunité" })).toBeInTheDocument();
});

it("shows conversion controls only for an eligible opportunity", () => {
  const { rerender } = render(
    <ConversionForm
      action={idleAction}
      opportunityId="opportunity-1"
      opportunityName="Audit SI"
      paymentTermsDays={30}
      status="proposal"
      today="2026-09-05"
      convertedEngagementId={null}
    />,
  );

  expect(screen.getByLabelText("Référence de commande")).toHaveValue("Audit SI");
  expect(screen.getByRole("button", { name: "Convertir en commande" })).toBeInTheDocument();

  rerender(
    <ConversionForm
      action={idleAction}
      opportunityId="opportunity-1"
      opportunityName="Audit SI"
      paymentTermsDays={30}
      status="proposal"
      today="2026-09-05"
      convertedEngagementId="engagement-1"
    />,
  );

  expect(screen.queryByRole("button", { name: "Convertir en commande" })).toBeNull();
});

it("offers an accessible deletion control for an unconverted opportunity", () => {
  render(
    <DeleteOpportunityForm
      action={idleAction}
      opportunityId="opportunity-1"
      opportunityName="Audit SI"
    />,
  );

  expect(screen.getByRole("button", { name: "Supprimer l’opportunité Audit SI" })).toBeInTheDocument();
});

it("announces an opportunity deletion refusal", async () => {
  const rejectedAction = async () => ({
    message: "Une opportunité convertie ne peut pas être supprimée.",
    success: false,
  });
  render(
    <DeleteOpportunityForm
      action={rejectedAction}
      opportunityId="opportunity-1"
      opportunityName="Audit SI"
    />,
  );

  const form = screen.getByRole("button", { name: "Supprimer l’opportunité Audit SI" }).closest("form");
  fireEvent.submit(form!);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Une opportunité convertie ne peut pas être supprimée.",
  );
});

it("renders an inline validation error returned by the action", async () => {
  const rejectedAction = async () => ({
    message: "Vérifiez les informations de l’opportunité.",
    success: false,
  });
  render(
    <OpportunityForm
      action={rejectedAction}
      customers={[{ id: "customer-1", name: "Atelier Atlas" }]}
    />,
  );

  const form = screen.getByRole("button", { name: "Créer l’opportunité" }).closest("form");
  expect(form).not.toBeNull();
  fireEvent.submit(form!);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Vérifiez les informations de l’opportunité.",
  );
});
