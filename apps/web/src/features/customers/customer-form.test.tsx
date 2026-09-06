import { fireEvent, render, screen } from "@testing-library/react";

import { CustomerDeleteForm, CustomerForm } from "./customer-form";

const idleAction = async () => ({ message: null, success: false });

it("collects the customer fields used by opportunities", () => {
  render(<CustomerForm action={idleAction} />);

  expect(screen.getByLabelText("Nom du client")).toBeRequired();
  expect(screen.getByLabelText("E-mail")).toHaveAttribute("type", "email");
  expect(screen.getByLabelText("Délai de paiement (jours)")).toHaveValue("30");
  expect(screen.getByRole("button", { name: "Créer le client" })).toBeInTheDocument();
});

it("offers an accessible deletion control for a customer", () => {
  render(
    <CustomerDeleteForm
      action={idleAction}
      customerId="customer-1"
      customerName="Atelier Atlas"
    />,
  );

  expect(screen.getByRole("button", { name: "Supprimer le client Atelier Atlas" })).toBeInTheDocument();
});

it("announces successful customer deletion", async () => {
  const successAction = async () => ({ message: "Client supprimé.", success: true });
  render(
    <CustomerDeleteForm
      action={successAction}
      customerId="customer-1"
      customerName="Atelier Atlas"
    />,
  );

  const form = screen.getByRole("button", { name: "Supprimer le client Atelier Atlas" }).closest("form");
  fireEvent.submit(form!);

  expect(await screen.findByRole("status")).toHaveTextContent("Client supprimé.");
});
