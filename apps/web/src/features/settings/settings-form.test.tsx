import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { SettingsForm } from "./settings-form";

const idleAction = async () => ({ message: null, success: false });

it("edits the supported owner settings and explains reserve limits", () => {
  render(
    <SettingsForm
      action={idleAction}
      value={{
        safetyThreshold: "20000,00",
        timezone: "Europe/Paris",
        legalForm: "SASU",
        defaultForecastHorizonDays: 90,
        defaultScenario: "committed",
      }}
    />,
  );

  expect(screen.getByLabelText("Seuil de sécurité")).toHaveValue("20000,00");
  expect(screen.getByLabelText("Fuseau horaire IANA")).toHaveValue("Europe/Paris");
  expect(screen.getByLabelText("Forme juridique")).toHaveValue("SASU");
  expect(screen.getByLabelText("Horizon par défaut")).toHaveValue("90");
  expect(screen.getByLabelText("Scénario par défaut")).toHaveValue("committed");
  expect(screen.getByText(/ne sont pas des calculs fiscaux officiels/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enregistrer les paramètres" })).toBeInTheDocument();
});
