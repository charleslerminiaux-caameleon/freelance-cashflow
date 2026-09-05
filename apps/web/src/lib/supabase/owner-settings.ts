import "server-only";

import { z } from "zod";

import { createAdminClient } from "./admin";

const ownerRowSchema = z.object({
  owner_user_id: z.string().uuid(),
});

export async function getOwnerUserId(): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("app_settings")
    .select("owner_user_id")
    .eq("singleton_key", true)
    .maybeSingle();

  if (error) {
    throw new Error("Impossible de vérifier le propriétaire de cette instance.");
  }

  return data ? ownerRowSchema.parse(data).owner_user_id : null;
}
