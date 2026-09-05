export type AppRouteState = {
  hasSession: boolean;
  hasOwner: boolean;
  isOwner?: boolean;
};

export type AppEntryRoute = "/login" | "/onboarding" | "/dashboard" | "/access-denied";

export function decideAppRoute({
  hasSession,
  hasOwner,
  isOwner = false,
}: AppRouteState): AppEntryRoute {
  if (!hasSession) {
    return "/login";
  }

  if (!hasOwner) {
    return "/onboarding";
  }

  return isOwner ? "/dashboard" : "/access-denied";
}

export function decideRouteRedirect(
  pathname: string,
  state: AppRouteState,
): AppEntryRoute | null {
  const destination = decideAppRoute(state);

  if (pathname === destination) {
    return null;
  }

  if (destination === "/dashboard") {
    const isEntryRoute =
      pathname === "/" ||
      pathname === "/login" ||
      pathname === "/onboarding" ||
      pathname === "/access-denied";

    return isEntryRoute ? destination : null;
  }

  return destination;
}
