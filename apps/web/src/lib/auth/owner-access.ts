export type OwnerAccessDecision =
  | { kind: "allowed"; userId: string }
  | { kind: "redirect"; destination: "/login" | "/onboarding" | "/access-denied" };

export function decideOwnerAccess(
  verifiedUserId: string | null,
  ownerUserId: string | null,
): OwnerAccessDecision {
  if (!verifiedUserId) {
    return { kind: "redirect", destination: "/login" };
  }

  if (!ownerUserId) {
    return { kind: "redirect", destination: "/onboarding" };
  }

  if (verifiedUserId !== ownerUserId) {
    return { kind: "redirect", destination: "/access-denied" };
  }

  return { kind: "allowed", userId: verifiedUserId };
}
