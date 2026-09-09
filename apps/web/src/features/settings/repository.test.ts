import type { SupabaseClient } from "@supabase/supabase-js";
import { moneyCents } from "@fc/shared";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { updateOwnerSettings } from "./repository";

const ownerUserId = "11111111-1111-4111-8111-111111111111";

it("updates only supported singleton fields within the owner scope", async () => {
  const row = {
    singleton_key: true,
    owner_user_id: ownerUserId,
    currency: "EUR",
    timezone: "Europe/Paris",
    country: "FR",
    legal_form: "SASU",
    manual_current_balance_cents: 0,
    manual_balance_as_of: "2026-09-07",
    safety_cash_threshold_cents: 2_000_000,
    default_forecast_horizon_days: 90,
    default_scenario: "committed",
    created_at: "2026-09-05T10:00:00Z",
    updated_at: "2026-09-07T10:00:00Z",
  };
  const result = { data: row, error: null };
  const chain = {
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
    update: vi.fn(),
  };
  for (const method of [chain.eq, chain.select, chain.update]) method.mockReturnValue(chain);
  const client = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;

  await updateOwnerSettings(client, ownerUserId, {
    safetyCashThresholdCents: moneyCents(2_000_000),
    timezone: "Europe/Paris",
    legalForm: "SASU",
    defaultForecastHorizonDays: 90,
    defaultScenario: "committed",
  });

  expect(chain.update).toHaveBeenCalledWith({
    safety_cash_threshold_cents: 2_000_000,
    timezone: "Europe/Paris",
    legal_form: "SASU",
    default_forecast_horizon_days: 90,
    default_scenario: "committed",
  });
  expect(chain.eq).toHaveBeenCalledWith("owner_user_id", ownerUserId);
  expect(chain.eq).toHaveBeenCalledWith("singleton_key", true);
});
