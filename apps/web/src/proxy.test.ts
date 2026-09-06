import { NextRequest, NextResponse } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

const { getOwnerUserId, refreshAuth } = vi.hoisted(() => ({
  getOwnerUserId: vi.fn(),
  refreshAuth: vi.fn(),
}));

vi.mock("@/lib/supabase/owner-settings", () => ({ getOwnerUserId }));
vi.mock("@/lib/supabase/proxy", () => ({ refreshAuth }));

import { proxy } from "./proxy";

beforeEach(() => {
  getOwnerUserId.mockReset();
  refreshAuth.mockReset();
});

it("preserves refreshed session cookies when redirecting a non-owner", async () => {
  const refreshedResponse = NextResponse.next();
  refreshedResponse.cookies.set("sb-refresh-token", "fresh-token", {
    httpOnly: true,
    maxAge: 3600,
    path: "/auth",
    sameSite: "lax",
    secure: true,
  });
  refreshAuth.mockResolvedValue({
    response: refreshedResponse,
    userId: "77777777-7777-4777-8777-777777777777",
  });
  getOwnerUserId.mockResolvedValue("66666666-6666-4666-8666-666666666666");

  const response = await proxy(new NextRequest("https://cashflow.example/dashboard"));

  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("https://cashflow.example/access-denied");
  const setCookie = response.headers.get("set-cookie");

  expect(setCookie).toContain("sb-refresh-token=fresh-token");
  expect(setCookie).toContain("Path=/auth");
  expect(setCookie).toContain("Max-Age=3600");
  expect(setCookie).toContain("Secure");
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("SameSite=lax");
});
