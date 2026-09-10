import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const { createClient, listEngagements, requireOwner } = vi.hoisted(() => ({
  createClient: vi.fn(),
  listEngagements: vi.fn(),
  requireOwner: vi.fn(),
}));

vi.mock("@/features/engagements/repository", () => ({ listEngagements }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

beforeEach(() => {
  requireOwner.mockResolvedValue({ userId: "11111111-1111-4111-8111-111111111111" });
  createClient.mockResolvedValue({});
  listEngagements.mockResolvedValue([
    {
      id: "22222222-2222-4222-8222-222222222222",
      reference: "CMD-001",
      customer: { name: "Atelier Bleu" },
      status: "active",
      amount_ht_cents: 100_000,
      amount_ttc_cents: 120_000,
      signed_at: "2026-09-01",
      payment_terms_days: 30,
    },
  ]);
});

it("links an order to its billing plan", async () => {
  const { default: EngagementsPage } = await import("./page");
  render(await EngagementsPage());

  expect(
    screen.getByRole("link", { name: /Voir la commande et son plan de facturation →/u }),
  ).toHaveAttribute("href", "/engagements/22222222-2222-4222-8222-222222222222");
});
