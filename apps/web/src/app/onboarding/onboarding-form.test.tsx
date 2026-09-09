import { render, screen } from "@testing-library/react";

import { OnboardingForm } from "./onboarding-form";

const idleAction = async () => ({ message: null });

it("collects the owner settings required by onboarding", () => {
  render(<OnboardingForm action={idleAction} />);

  expect(screen.getByLabelText("Devise")).toHaveValue("EUR");
  expect(screen.getByLabelText("Pays")).toHaveValue("FR");
  expect(screen.getByLabelText("Fuseau horaire")).toHaveValue("Europe/Paris");
  expect(screen.getByLabelText("Solde d’ouverture")).toHaveAttribute("inputmode", "decimal");
  expect(screen.getByLabelText("Seuil de sécurité")).toHaveAttribute("inputmode", "decimal");
  expect(screen.getByRole("button", { name: "Terminer la configuration" })).toBeInTheDocument();
});
