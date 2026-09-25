import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { readPublicConfig } from "@/lib/env/public";

const userIdSchema = z.string().uuid();

export async function refreshAuth(request: NextRequest) {
  let response = NextResponse.next({ request });

  const publicEnv = readPublicConfig();
  const supabase = createServerClient(
    publicEnv.url,
    publicEnv.anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const parsedUserId = userIdSchema.safeParse(user?.id);

  return {
    response,
    userId: parsedUserId.success ? parsedUserId.data : null,
  };
}
