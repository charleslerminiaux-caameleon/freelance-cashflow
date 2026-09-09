import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const { createClient, getOwnerBusinessDate, listCustomers, listOpportunities, requireOwner } =
  vi.hoisted(() => ({
    createClient: vi.fn(),
    getOwnerBusinessDate: vi.fn(),
    listCustomers: vi.fn(),
    listOpportunities: vi.fn(),
    requireOwner: vi.fn(),
  }));

vi.mock("@/features/customers/repository", () => ({ listCustomers }));
vi.mock("@/features/invoices/business-date", () => ({ getOwnerBusinessDate }));
vi.mock("@/features/opportunities/repository", () => ({ listOpportunities }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import OpportunitiesPage from "./page";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const client = { kind: "SSR client" };

beforeEach(() => {
  vi.clearAllMocks();
  requireOwner.mockResolvedValue({ userId: ownerUserId });
  createClient.mockResolvedValue(client);
  getOwnerBusinessDate.mockResolvedValue("2030-02-03");
  listCustomers.mockResolvedValue([
    {
      id: "22222222-2222-4222-8222-222222222222",
      owner_user_id: ownerUserId,
      name: "Atelier Bleu",
      email: null,
      payment_terms_days: 30,
      notes: null,
      created_at: "2030-02-01T10:00:00Z",
      updated_at: "2030-02-01T10:00:00Z",
    },
  ]);
  listOpportunities.mockResolvedValue([
    {
      id: "33333333-3333-4333-8333-333333333333",
      owner_user_id: ownerUserId,
      customer_id: "22222222-2222-4222-8222-222222222222",
      name: "Mission conseil",
      status: "proposal",
      estimated_amount_ht_cents: 1_000_000,
      probability_basis_points: 8_000,
      expected_close_date: "2030-02-10",
      expected_start_date: null,
      expected_end_date: null,
      notes: null,
      converted_engagement_id: null,
      customer: { name: "Atelier Bleu", payment_terms_days: 30 },
    },
  ]);
});

it("uses the owner's business date as the signed-order default", async () => {
  render(await OpportunitiesPage());

  expect(getOwnerBusinessDate).toHaveBeenCalledWith(client, ownerUserId);
  expect(screen.getByLabelText("Date de signature")).toHaveValue("2030-02-03");
});
