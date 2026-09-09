import "server-only";

import { localDate } from "@fc/shared";
import type { LocalDate } from "@fc/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { repositoryError, RepositoryError } from "../repository-error";

const ownerTimezoneRowSchema = z.object({
  timezone: z.string().trim().min(1).max(100),
});

export function businessDateAt(timezone: string, instant: Date): LocalDate {
  const parsed = ownerTimezoneRowSchema.shape.timezone.safeParse(timezone);
  if (!parsed.success || Number.isNaN(instant.getTime())) {
    throw new RepositoryError("FC_INVALID_TIMEZONE");
  }

  try {
    return localDate(
      new Intl.DateTimeFormat("sv-SE", { timeZone: parsed.data }).format(instant),
    );
  } catch {
    throw new RepositoryError("FC_INVALID_TIMEZONE");
  }
}

export async function getOwnerBusinessDate(
  client: SupabaseClient,
  ownerUserId: string,
  instant: Date = new Date(),
): Promise<LocalDate> {
  const { data, error } = await client
    .from("app_settings")
    .select("timezone")
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  if (error) throw repositoryError(error);
  const parsed = ownerTimezoneRowSchema.safeParse(data);
  if (!parsed.success) throw new RepositoryError("FC_INVALID_TIMEZONE");
  return businessDateAt(parsed.data.timezone, instant);
}
