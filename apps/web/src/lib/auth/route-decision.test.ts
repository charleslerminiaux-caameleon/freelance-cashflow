import { describe, expect, it } from "vitest";

import { decideAppRoute, decideRouteRedirect } from "./route-decision";

describe("decideAppRoute", () => {
  it("sends an unauthenticated visitor to login", () => {
    expect(decideAppRoute({ hasSession: false, hasOwner: false })).toBe("/login");
  });

  it("sends the first authenticated account to onboarding", () => {
    expect(decideAppRoute({ hasSession: true, hasOwner: false })).toBe("/onboarding");
  });

  it("sends the authenticated owner to the dashboard", () => {
    expect(decideAppRoute({ hasSession: true, hasOwner: true, isOwner: true })).toBe(
      "/dashboard",
    );
  });

  it("denies an authenticated account that does not own the instance", () => {
    expect(decideAppRoute({ hasSession: true, hasOwner: true, isOwner: false })).toBe(
      "/access-denied",
    );
  });
});

describe("decideRouteRedirect", () => {
  it("allows an unauthenticated visitor to remain on login", () => {
    expect(
      decideRouteRedirect("/login", { hasSession: false, hasOwner: false }),
    ).toBeNull();
  });

  it("protects application routes from unauthenticated visitors", () => {
    expect(
      decideRouteRedirect("/dashboard", { hasSession: false, hasOwner: false }),
    ).toBe("/login");
  });

  it("keeps the first verified account on onboarding", () => {
    expect(
      decideRouteRedirect("/onboarding", { hasSession: true, hasOwner: false }),
    ).toBeNull();
  });

  it("moves an initialized owner away from authentication pages", () => {
    expect(
      decideRouteRedirect("/login", {
        hasSession: true,
        hasOwner: true,
        isOwner: true,
      }),
    ).toBe("/dashboard");
  });

  it("allows the initialized owner to remain on application routes", () => {
    expect(
      decideRouteRedirect("/invoices", {
        hasSession: true,
        hasOwner: true,
        isOwner: true,
      }),
    ).toBeNull();
  });

  it("keeps a non-owner account on access denied", () => {
    expect(
      decideRouteRedirect("/access-denied", {
        hasSession: true,
        hasOwner: true,
        isOwner: false,
      }),
    ).toBeNull();
  });
});
