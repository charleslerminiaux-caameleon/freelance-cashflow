import { type NextRequest, NextResponse } from "next/server";

import { decideRouteRedirect } from "@/lib/auth/route-decision";
import { getOwnerUserId } from "@/lib/supabase/owner-settings";
import { refreshAuth } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { response, userId } = await refreshAuth(request);
  const ownerUserId = userId ? await getOwnerUserId() : null;
  const destination = decideRouteRedirect(request.nextUrl.pathname, {
    hasSession: userId !== null,
    hasOwner: ownerUserId !== null,
    isOwner: userId !== null && userId === ownerUserId,
  });

  if (!destination) {
    return response;
  }

  const redirectResponse = NextResponse.redirect(new URL(destination, request.url));

  for (const cookie of response.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }

  return redirectResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
