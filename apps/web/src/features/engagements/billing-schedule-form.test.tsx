import { fireEvent, render, screen } from "@testing-library/react";

import { BillingScheduleForm } from "./billing-schedule-form";

const idleAction = async () => ({ message: null, success: false });

it("collects a billing step using euros, VAT and ISO dates", () => {
  render(
    <BillingScheduleForm
      action={idleAction}
      engagementId="engagement-1"
      paymentTermsDays={30}
    />,
  );

  expect(screen.getByLabelText("Montant HT")).toHaveAttribute("inputmode", "decimal");
  expect(screen.getByLabelText("TVA (%)")).toHaveValue("20");
  expect(screen.getByLabelText("Date de facturation prévue")).toHaveAttribute("type", "date");
  expect(screen.getByText("Le total TTC des étapes de facturation ne peut pas dépasser la commande.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ajouter une étape de facturation" })).toBeInTheDocument();
});

it("announces a successful billing step without using an alert", async () => {
  const action = async () => ({ message: "Étape de facturation ajoutée.", success: true });
  render(
    <BillingScheduleForm
      action={action}
      engagementId="engagement-1"
      paymentTermsDays={30}
    />,
  );

  const form = screen.getByRole("button", { name: "Ajouter une étape de facturation" }).closest("form");
  expect(form).not.toBeNull();
  fireEvent.submit(form!);

  expect(await screen.findByRole("status")).toHaveTextContent("Étape de facturation ajoutée.");
  expect(screen.queryByRole("alert")).toBeNull();
});
