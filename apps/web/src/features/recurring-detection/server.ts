import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnalysisStore } from "./store";
import type { AnalysisDependencies } from "./service";
export function productionAnalysisDependencies(): AnalysisDependencies {
  return { store: createAnalysisStore(createAdminClient()), runId: randomUUID, now: () => new Date() };
}
