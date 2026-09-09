import type { SupabaseClient } from "@supabase/supabase-js";
import { moneyCents } from "@fc/shared";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  deleteOpportunity,
  executeOpportunityConversion,
  updateOpportunity,
} from "./repository";
import { RepositoryError } from "../repository-error";

const opportunityId = "22222222-2222-4222-8222-222222222222";
const ownerUserId = "11111111-1111-4111-8111-111111111111";

const opportunity = {
  id: opportunityId,
  owner_user_id: ownerUserId,
  customer_id: "33333333-3333-4333-8333-333333333333",
  name: "Audit SI",
  status: "proposal",
  estimated_amount_ht_cents: 600_000,
  probability_basis_points: 7_500,
  expected_close_date: null,
  expected_start_date: null,
  expected_end_date: null,
  notes: null,
  converted_engagement_id: null,
  customer: { name: "Atelier Atlas", payment_terms_days: 30 },
};

function queryClient(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const query = {
    delete: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle,
    select: vi.fn(),
    single,
    update: vi.fn(),
  };

  for (const method of [query.delete, query.eq, query.is, query.select, query.update]) {
    method.mockReturnValue(query);
  }

  return {
    client: { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient,
    query,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it("uses VAT basis points as the conversion RPC input", async () => {
  const ownershipQuery = queryClient({ data: { id: opportunityId }, error: null });
  const rpc = vi.fn().mockResolvedValue({
    data: "44444444-4444-4444-8444-444444444444",
    error: null,
  });
  const client = { ...ownershipQuery.client, rpc } as unknown as SupabaseClient;

  await executeOpportunityConversion(client, ownerUserId, {
    opportunityId,
    reference: "CMD-2026-001",
    signedAt: "2026-09-06",
    vatRateBasisPoints: 2_000,
    paymentTermsDays: 30,
  });

  expect(rpc).toHaveBeenCalledWith("convert_opportunity", {
    p_opportunity_id: opportunityId,
    p_reference: "CMD-2026-001",
    p_signed_at: "2026-09-06",
    p_vat_rate_basis_points: 2_000,
    p_payment_terms_days: 30,
  });
});

it("guards opportunity updates against a concurrent conversion", async () => {
  const { client, query } = queryClient({ data: opportunity, error: null });

  await updateOpportunity(client, ownerUserId, opportunityId, {
    customerId: opportunity.customer_id,
    name: opportunity.name,
    status: "proposal",
    estimatedAmountHtCents: moneyCents(600_000),
    probabilityBasisPoints: 7_500,
    expectedCloseDate: null,
    expectedStartDate: null,
    expectedEndDate: null,
    notes: null,
  });

  expect(query.is).toHaveBeenCalledWith("converted_engagement_id", null);
});

it("guards opportunity deletion against a concurrent conversion", async () => {
  const { client, query } = queryClient({ data: { id: opportunityId }, error: null });

  await deleteOpportunity(client, ownerUserId, opportunityId);

  expect(query.is).toHaveBeenCalledWith("converted_engagement_id", null);
});

it("reports a guarded update that lost a race with conversion", async () => {
  const { client } = queryClient({ data: null, error: null });

  const update = updateOpportunity(client, ownerUserId, opportunityId, {
    customerId: opportunity.customer_id,
    name: opportunity.name,
    status: "proposal",
    estimatedAmountHtCents: moneyCents(600_000),
    probabilityBasisPoints: 7_500,
    expectedCloseDate: null,
    expectedStartDate: null,
    expectedEndDate: null,
    notes: null,
  });

  await expect(update).rejects.toEqual(
    new RepositoryError("FC_CONVERTED_OPPORTUNITY_IMMUTABLE"),
  );
});

it("reports a guarded deletion that lost a race with conversion", async () => {
  const { client } = queryClient({ data: null, error: null });

  const deletion = deleteOpportunity(client, ownerUserId, opportunityId);

  await expect(deletion).rejects.toEqual(
    new RepositoryError("FC_CONVERTED_OPPORTUNITY_IMMUTABLE"),
  );
});
