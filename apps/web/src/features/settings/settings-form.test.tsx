import { render, screen, within } from "@testing-library/react";
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
  expect(
    within(screen.getByLabelText("Horizon par défaut")).getAllByRole("option").map((option) =>
      option.getAttribute("value"),
    ),
  ).toEqual(["30", "90", "180"]);
  expect(screen.getByLabelText("Scénario par défaut")).toHaveValue("committed");
  expect(screen.getByText(/ne sont pas des calculs fiscaux officiels/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enregistrer les paramètres" })).toBeInTheDocument();
});

it("shows an unsupported stored horizon without silently selecting a replacement", () => {
  render(
    <SettingsForm
      action={idleAction}
      value={{
        safetyThreshold: "20000,00",
        timezone: "Europe/Paris",
        legalForm: "SASU",
        defaultForecastHorizonDays: null,
        defaultScenario: "committed",
      }}
    />,
  );

  expect(screen.getByLabelText("Horizon par défaut")).toHaveValue("");
  expect(screen.getByLabelText("Horizon par défaut")).toBeRequired();
  expect(screen.getByRole("option", { name: "Choisissez un horizon pris en charge" })).toBeDisabled();
});
