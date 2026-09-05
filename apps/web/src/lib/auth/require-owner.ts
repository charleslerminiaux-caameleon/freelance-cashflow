import "server-only";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getOwnerUserId } from "@/lib/supabase/owner-settings";
import { decideOwnerAccess } from "./owner-access";

const userIdSchema = z.string().uuid();

export async function requireOwner(): Promise<{ userId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const parsedUserId = userIdSchema.safeParse(user?.id);

  if (!parsedUserId.success) {
    redirect("/login");
  }

  const ownerUserId = await getOwnerUserId();
  const decision = decideOwnerAccess(parsedUserId.data, ownerUserId);

  if (decision.kind === "redirect") {
    redirect(decision.destination);
  }

  return { userId: decision.userId };
}
