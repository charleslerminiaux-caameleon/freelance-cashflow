import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { RepositoryError } from "../repository-error";
import { businessDateAt, getOwnerBusinessDate } from "./business-date";

const ownerUserId = "11111111-1111-4111-8111-111111111111";
const boundaryInstant = new Date("2026-01-01T07:30:00.000Z");

function settingsClient(result: { data: unknown; error: unknown }) {
  const chain = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    select: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  const from = vi.fn().mockReturnValue(chain);
  return { client: { from } as unknown as SupabaseClient, chain, from };
}

describe("businessDateAt", () => {
  it("derives the owner day at an IANA timezone boundary", () => {
    expect(businessDateAt("America/Los_Angeles", boundaryInstant)).toBe("2025-12-31");
    expect(businessDateAt("Europe/Paris", boundaryInstant)).toBe("2026-01-01");
  });

  it("rejects an invalid timezone instead of silently using the server timezone", () => {
    expect(() => businessDateAt("Mars/Olympus_Mons", boundaryInstant)).toThrow(
      new RepositoryError("FC_INVALID_TIMEZONE"),
    );
  });
});

it("reads the owner-scoped timezone before deriving the business date", async () => {
  const { client, chain, from } = settingsClient({
    data: { timezone: "America/Los_Angeles" },
    error: null,
  });

  await expect(getOwnerBusinessDate(client, ownerUserId, boundaryInstant)).resolves.toBe(
    "2025-12-31",
  );
  expect(from).toHaveBeenCalledWith("app_settings");
  expect(chain.eq).toHaveBeenCalledWith("owner_user_id", ownerUserId);
});

it("fails closed when the owner timezone row is absent", async () => {
  const { client } = settingsClient({ data: null, error: null });

  await expect(getOwnerBusinessDate(client, ownerUserId, boundaryInstant)).rejects.toEqual(
    new RepositoryError("FC_INVALID_TIMEZONE"),
  );
});
