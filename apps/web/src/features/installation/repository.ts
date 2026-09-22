import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getQontoIntegration } from "@/features/integrations/repository";
import { buildInstallationReport, type InstallationSnapshot } from "./report";

const contractSchema = z.object({ version: z.number().int(), syncIntervalSeconds: z.number().int() }).strict();
// Each query has its own cancellation budget; failure of one optional step does
// not hide successful checks. Only booleans and whitelisted metadata escape.
async function check<T>(read: (signal: AbortSignal) => PromiseLike<T>): Promise<T | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve().then(() => read(controller.signal)),
      new Promise<null>(resolve => { timer = setTimeout(() => { controller.abort(); resolve(null); }, 5_000); })]);
  } catch { return null; }
  finally { clearTimeout(timer); controller.abort(); }
}
export async function loadInstallationReport(client: SupabaseClient, ownerUserId: string, qontoConfigured: boolean) {
  z.string().uuid().parse(ownerUserId);
  async function exists(table: "app_settings" | "invoices" | "recurring_cashflows" | "planned_cashflows", kinds?: string[]) {
    return check(async signal => {
      let query = client.from(table).select("owner_user_id").eq("owner_user_id", ownerUserId).limit(1);
      if (kinds) query = query.in("cashflow_kind", kinds);
      if (table === "recurring_cashflows") query = query.eq("active", true);
      if (table === "planned_cashflows") query = query.eq("status", "planned");
      const { data, error } = await query.abortSignal(signal);
      if (error || !Array.isArray(data)) throw new Error("DATABASE_ERROR");
      return data.length > 0;
    });
  }
  const [database, contract, recurring, planned, recurringReserves, plannedReserves, invoices, banking] = await Promise.all([
    exists("app_settings"),
    check(async signal => {
      const { data, error } = await client.rpc("installation_diagnostic").abortSignal(signal);
      if (error) throw new Error("DATABASE_ERROR");
      return contractSchema.parse(data);
    }),
    exists("recurring_cashflows", ["expense"]), exists("planned_cashflows", ["expense"]),
    exists("recurring_cashflows", ["reserve", "remuneration"]), exists("planned_cashflows", ["reserve", "remuneration"]),
    exists("invoices"),
    check(async signal => ({ integration: await getQontoIntegration(client, ownerUserId, signal) })),
  ]);
  const combine = (a: boolean | null, b: boolean | null) => a === true || b === true ? true : a === null || b === null ? null : false;
  const snapshot: InstallationSnapshot = { database: database === true, contract,
    expenses: combine(recurring, planned), reserves: combine(recurringReserves, plannedReserves), invoices,
    integration: banking?.integration };
  return buildInstallationReport(snapshot, qontoConfigured);
}
