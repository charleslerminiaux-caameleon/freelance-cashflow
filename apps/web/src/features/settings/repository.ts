import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { businessDateSchema } from "../commercial-schema";
import { repositoryError } from "../repository-error";
import type { SettingsCommand } from "./schema";

const settingsRowSchema = z.object({
  singleton_key: z.literal(true),
  owner_user_id: z.string().uuid(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  timezone: z.string(),
  country: z.string().regex(/^[A-Z]{2}$/),
  legal_form: z.string().nullable(),
  manual_current_balance_cents: z.number().int().safe(),
  manual_balance_as_of: businessDateSchema,
  safety_cash_threshold_cents: z.number().int().safe().nonnegative(),
  default_forecast_horizon_days: z.number().int().min(1).max(366),
  default_scenario: z.enum(["certain", "committed", "probable"]),
  created_at: z.string(),
  updated_at: z.string(),
});

export type OwnerSettings = z.infer<typeof settingsRowSchema>;

const settingsColumns = `
  singleton_key, owner_user_id, currency, timezone, country, legal_form,
  manual_current_balance_cents, manual_balance_as_of, safety_cash_threshold_cents,
  default_forecast_horizon_days, default_scenario, created_at, updated_at
`;

export async function getOwnerSettings(
  client: SupabaseClient,
  ownerUserId: string,
): Promise<OwnerSettings> {
  const { data, error } = await client
    .from("app_settings")
    .select(settingsColumns)
    .eq("owner_user_id", ownerUserId)
    .eq("singleton_key", true)
    .single();

  if (error) throw repositoryError(error);
  return settingsRowSchema.parse(data);
}

export async function updateOwnerSettings(
  client: SupabaseClient,
  ownerUserId: string,
  command: SettingsCommand,
): Promise<OwnerSettings> {
  const { data, error } = await client
    .from("app_settings")
    .update({
      safety_cash_threshold_cents: command.safetyCashThresholdCents,
      timezone: command.timezone,
      legal_form: command.legalForm,
      default_forecast_horizon_days: command.defaultForecastHorizonDays,
      default_scenario: command.defaultScenario,
    })
    .eq("owner_user_id", ownerUserId)
    .eq("singleton_key", true)
    .select(settingsColumns)
    .single();

  if (error) throw repositoryError(error);
  return settingsRowSchema.parse(data);
}
