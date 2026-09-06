import { beforeEach, expect, it, vi } from "vitest";

const { authSignOut, createClient, redirect } = vi.hoisted(() => ({
  authSignOut: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/navigation", () => ({ redirect }));

import { signOut } from "./actions";

beforeEach(() => {
  createClient.mockReset();
  redirect.mockClear();
  authSignOut.mockReset();
  createClient.mockResolvedValue({ auth: { signOut: authSignOut } });
  authSignOut.mockResolvedValue({ error: null });
});

it("signs out the current account before returning to login", async () => {
  await expect(signOut()).rejects.toThrow("NEXT_REDIRECT");

  expect(authSignOut).toHaveBeenCalledWith({ scope: "local" });
  expect(redirect).toHaveBeenCalledWith("/login");
});
