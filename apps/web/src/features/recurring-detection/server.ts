import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnalysisStore } from "./store";
import type { AnalysisDependencies } from "./service";
import type { RecurringBankProvider } from "./schema";
export function productionAnalysisDependencies(provider: RecurringBankProvider = "qonto"): AnalysisDependencies {
  return { store: createAnalysisStore(createAdminClient(), provider), runId: randomUUID, now: () => new Date() };
}
