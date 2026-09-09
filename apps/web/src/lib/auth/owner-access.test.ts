import { describe, expect, it } from "vitest";

import { decideOwnerAccess } from "./owner-access";

describe("decideOwnerAccess", () => {
  it("requires login when no verified user exists", () => {
    expect(decideOwnerAccess(null, null)).toEqual({ kind: "redirect", destination: "/login" });
  });

  it("allows the verified user to initialize an ownerless instance", () => {
    expect(decideOwnerAccess("user-one", null)).toEqual({
      kind: "redirect",
      destination: "/onboarding",
    });
  });

  it("rejects a verified user who is not the instance owner", () => {
    expect(decideOwnerAccess("user-two", "user-one")).toEqual({
      kind: "redirect",
      destination: "/access-denied",
    });
  });

  it("returns only the verified owner id when access is allowed", () => {
    expect(decideOwnerAccess("user-one", "user-one")).toEqual({
      kind: "allowed",
      userId: "user-one",
    });
  });
});
