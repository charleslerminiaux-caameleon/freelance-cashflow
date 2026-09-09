import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";

import { RepositoryError } from "../repository-error";
import { deleteCustomer } from "./repository";

function deletionClient(data: { id: string } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  const query = {
    delete: vi.fn(),
    eq: vi.fn(),
    maybeSingle,
    select: vi.fn(),
  };

  for (const method of [query.delete, query.eq, query.select]) {
    method.mockReturnValue(query);
  }

  return { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient;
}

it("reports when an owner-scoped customer deletion removed no row", async () => {
  const deletion = deleteCustomer(
    deletionClient(null),
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  );

  await expect(deletion).rejects.toEqual(new RepositoryError("FC_CUSTOMER_NOT_FOUND"));
});
