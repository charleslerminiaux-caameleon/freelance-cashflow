import { fireEvent, render, screen } from "@testing-library/react";

import { BillingScheduleForm } from "./billing-schedule-form";

const idleAction = async () => ({ message: null, success: false });

it("collects an invoice milestone using euros, VAT and ISO dates", () => {
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
  expect(screen.getByRole("button", { name: "Ajouter l’échéance" })).toBeInTheDocument();
});

it("announces a successful billing milestone without using an alert", async () => {
  const action = async () => ({ message: "Échéance ajoutée.", success: true });
  render(
    <BillingScheduleForm
      action={action}
      engagementId="engagement-1"
      paymentTermsDays={30}
    />,
  );

  const form = screen.getByRole("button", { name: "Ajouter l’échéance" }).closest("form");
  expect(form).not.toBeNull();
  fireEvent.submit(form!);

  expect(await screen.findByRole("status")).toHaveTextContent("Échéance ajoutée.");
  expect(screen.queryByRole("alert")).toBeNull();
});
