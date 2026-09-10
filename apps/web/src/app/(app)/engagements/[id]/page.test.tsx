import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const { createClient, getEngagement, listBillingScheduleItems, requireOwner } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getEngagement: vi.fn(),
  listBillingScheduleItems: vi.fn(),
  requireOwner: vi.fn(),
}));

vi.mock("@/features/engagements/repository", () => ({
  getEngagement,
  listBillingScheduleItems,
}));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

beforeEach(() => {
  requireOwner.mockResolvedValue({ userId: "11111111-1111-4111-8111-111111111111" });
  createClient.mockResolvedValue({});
  getEngagement.mockResolvedValue({
    id: "22222222-2222-4222-8222-222222222222",
    reference: "CMD-001",
    customer: { name: "Atelier Bleu" },
    status: "active",
    amount_ht_cents: 100_000,
    amount_ttc_cents: 120_000,
    signed_at: "2026-09-01",
    start_date: null,
    end_date: null,
    payment_terms_days: 30,
  });
  listBillingScheduleItems.mockResolvedValue([]);
});

it("names an empty order billing schedule as a billing plan with billing steps", async () => {
  const { default: EngagementDetailPage } = await import("./page");
  render(
    await EngagementDetailPage({
      params: Promise.resolve({ id: "22222222-2222-4222-8222-222222222222" }),
    }),
  );

  expect(screen.getByRole("heading", { name: "Plan de facturation" })).toBeInTheDocument();
  expect(screen.getByText("Aucune étape de facturation. Ajoutez un acompte, un jalon ou le solde.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Ajouter une étape de facturation" })).toBeInTheDocument();
});
