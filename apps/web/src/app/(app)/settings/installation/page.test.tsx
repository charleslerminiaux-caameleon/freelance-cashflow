import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), report: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.owner }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/features/installation/repository", () => ({ loadInstallationReport: mocks.report }));
vi.mock("@/features/integrations/qonto-config", () => ({ isQontoConfigured: () => false }));
import { buildInstallationReport } from "@/features/installation/report";
import InstallationPage from "./page";
beforeEach(() => {
  vi.clearAllMocks(); mocks.owner.mockResolvedValue({ userId: "10000000-0000-4000-8000-000000000001" });
  mocks.client.mockResolvedValue({});
  mocks.report.mockResolvedValue(buildInstallationReport({ database: true, contract: null, expenses: false, reserves: false, invoices: false, integration: null }, false));
});
it("offers a direct manual dashboard and actionable setup links with an explicit migration warning", async () => {
  render(await InstallationPage());
  expect(screen.getByRole("heading", { name: "Installation et diagnostic" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Ouvrir le dashboard" })).toHaveAttribute("href", "/dashboard");
  expect(screen.getByRole("link", { name: "Factures et import CSV" })).toHaveAttribute("href", "/invoices");
  expect(screen.getByText(/Compatibilité non confirmée/)).toBeVisible();
  expect(screen.getByText(/uniquement lorsque l’application est ouverte/)).toBeVisible();
});
it("authorizes before loading any diagnostic data", async () => {
  mocks.owner.mockRejectedValueOnce(new Error("REDIRECT_LOGIN"));
  await expect(InstallationPage()).rejects.toThrow("REDIRECT_LOGIN");
  expect(mocks.report).not.toHaveBeenCalled();
});
