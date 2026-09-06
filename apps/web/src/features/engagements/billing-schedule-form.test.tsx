import { render, screen } from "@testing-library/react";

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
