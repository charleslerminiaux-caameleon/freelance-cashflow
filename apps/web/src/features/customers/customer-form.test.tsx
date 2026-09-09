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

it("announces a successful customer creation without using an alert", async () => {
  const action = async () => ({ message: "Client créé.", success: true });
  render(<CustomerForm action={action} />);

  const form = screen.getByRole("button", { name: "Créer le client" }).closest("form");
  expect(form).not.toBeNull();
  fireEvent.submit(form!);

  expect(await screen.findByRole("status")).toHaveTextContent("Client créé.");
  expect(screen.queryByRole("alert")).toBeNull();
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

it("requires explicit confirmation before customer deletion", () => {
  let submissions = 0;
  const action = async () => {
    submissions += 1;
    return { message: "Client supprimé.", success: true };
  };
  render(
    <CustomerDeleteForm
      action={action}
      customerId="customer-1"
      customerName="Atelier Atlas"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Supprimer le client Atelier Atlas" }));

  expect(submissions).toBe(0);
  expect(
    screen.getByRole("button", { name: "Confirmer la suppression du client Atelier Atlas" }),
  ).toBeInTheDocument();
});

it("submits customer deletion after confirmation", async () => {
  const action = async () => ({ message: "Client supprimé.", success: true });
  render(
    <CustomerDeleteForm
      action={action}
      customerId="customer-1"
      customerName="Atelier Atlas"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Supprimer le client Atelier Atlas" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Confirmer la suppression du client Atelier Atlas" }),
  );

  expect(await screen.findByRole("status")).toHaveTextContent("Client supprimé.");
});

it("cancels customer deletion confirmation", () => {
  let submissions = 0;
  const action = async () => {
    submissions += 1;
    return { message: "Client supprimé.", success: true };
  };
  render(
    <CustomerDeleteForm
      action={action}
      customerId="customer-1"
      customerName="Atelier Atlas"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Supprimer le client Atelier Atlas" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Annuler la suppression du client Atelier Atlas" }),
  );

  expect(submissions).toBe(0);
  expect(
    screen.queryByRole("button", { name: "Confirmer la suppression du client Atelier Atlas" }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Supprimer le client Atelier Atlas" })).toBeInTheDocument();
});
