import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { IntegrationSetupForm } from "./setup-form";
it("collects credentials and shows safe connection feedback", async () => {
  const action = vi.fn(async () => ({ success: true, message: "Connexion enregistrée et synchronisée." }));
  render(<IntegrationSetupForm provider="qonto" configured={false} action={action} disconnectAction={action} />);
  fireEvent.change(screen.getByLabelText("Identifiant Qonto"), { target: { value: "login" } });
  fireEvent.change(screen.getByLabelText("Clé secrète Qonto"), { target: { value: "secret" } });
  expect(screen.getByLabelText("Clé secrète Qonto")).toHaveAttribute("type", "password");
  fireEvent.submit(screen.getByRole("form", { name: "Connexion Qonto" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Connexion enregistrée"));
});
it("never prefills saved credentials and offers disconnection for existing connections", () => {
  const action = vi.fn();
  render(<IntegrationSetupForm provider="pennylane" configured action={action} disconnectAction={action} />);
  expect(screen.getByLabelText("Jeton API Pennylane")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Déconnecter Pennylane" })).toBeEnabled();
});
