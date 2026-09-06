import { render, screen } from "@testing-library/react";

import { CustomerForm } from "./customer-form";

const idleAction = async () => ({ message: null, success: false });

it("collects the customer fields used by opportunities", () => {
  render(<CustomerForm action={idleAction} />);

  expect(screen.getByLabelText("Nom du client")).toBeRequired();
  expect(screen.getByLabelText("E-mail")).toHaveAttribute("type", "email");
  expect(screen.getByLabelText("Délai de paiement (jours)")).toHaveValue("30");
  expect(screen.getByRole("button", { name: "Créer le client" })).toBeInTheDocument();
});
