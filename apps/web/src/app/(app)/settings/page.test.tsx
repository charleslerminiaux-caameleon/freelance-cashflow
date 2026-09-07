import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const { createClient, getOwnerSettings, requireOwner } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getOwnerSettings: vi.fn(),
  requireOwner: vi.fn(),
}));

vi.mock("@/features/settings/repository", () => ({ getOwnerSettings }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import SettingsPage from "./page";

const ownerUserId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  requireOwner.mockResolvedValue({ userId: ownerUserId });
  createClient.mockResolvedValue({ kind: "SSR client" });
  getOwnerSettings.mockResolvedValue({
    singleton_key: true,
    owner_user_id: ownerUserId,
    currency: "EUR",
    timezone: "Europe/Paris",
    country: "FR",
    legal_form: "SASU",
    manual_current_balance_cents: 423_800,
    manual_balance_as_of: "2026-09-07",
    safety_cash_threshold_cents: 200_000,
    default_forecast_horizon_days: 90,
    default_scenario: "committed",
    created_at: "2026-09-05T10:00:00Z",
    updated_at: "2026-09-07T10:00:00Z",
  });
});

it("loads the owner singleton through SSR and edits only supported preferences", async () => {
  const { container } = render(await SettingsPage());

  expect(requireOwner).toHaveBeenCalledOnce();
  expect(createClient).toHaveBeenCalledOnce();
  expect(getOwnerSettings).toHaveBeenCalledWith({ kind: "SSR client" }, ownerUserId);
  expect(screen.getByRole("heading", { level: 1, name: "Paramètres" })).toBeInTheDocument();
  expect(screen.getByLabelText("Seuil de sécurité")).toHaveValue("2000,00");
  expect(screen.getByLabelText("Fuseau horaire IANA")).toHaveValue("Europe/Paris");
  expect(screen.getByLabelText("Forme juridique")).toHaveValue("SASU");
  expect(screen.getByLabelText("Horizon par défaut")).toHaveValue("90");
  expect(screen.getByLabelText("Scénario par défaut")).toHaveValue("committed");
  expect(container.querySelector('[name="owner_user_id"]')).toBeNull();
  expect(container.querySelector('[name="currency"]')).toBeNull();
  expect(container.querySelector('[name="country"]')).toBeNull();
  expect(screen.getByText(/ne sont pas des calculs fiscaux officiels/i)).toBeInTheDocument();
});
