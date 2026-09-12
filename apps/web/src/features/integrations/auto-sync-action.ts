"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";
import { getQontoIntegration } from "./repository";
import { isQontoConfigured } from "./qonto-config";
import { synchronizeQontoForOwner } from "./sync-qonto";
import { publicationTimestamp, type AutoSyncActionResult } from "./auto-sync-policy";

// This optional proof lets another tab's successful manual publication clear a
// local automatic error. Its short independent budget cannot extend banking work.
async function publicationProof(ownerUserId: string): Promise<{ lastSuccessAt?: string }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const client = await createClient();
        const integration = await getQontoIntegration(client, ownerUserId, controller.signal);
        const proof = integration?.last_success_at;
        return proof && publicationTimestamp(proof, Date.now()) !== null ? { lastSuccessAt: proof } : {};
      })(),
      new Promise<{ lastSuccessAt?: string }>(resolve => { timer = setTimeout(() => { controller.abort(); resolve({}); }, 5_000); }),
    ]);
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export async function autoSyncQontoAction(): Promise<AutoSyncActionResult> {
  const { userId } = await requireOwner();
  if (!isQontoConfigured()) return { status: "skipped" };
  try {
    const result = await synchronizeQontoForOwner(userId, { mode: "automatic" });
    if (!result.success) return { status: "error", code: result.code, ...await publicationProof(userId) };
    if (result.skipped) return { status: "skipped", ...await publicationProof(userId) };
    for (const path of ["/integrations", "/cashflow", "/dashboard", "/expenses"]) revalidatePath(path);
    revalidatePath("/", "layout");
    return { status: "synced", analysisResult: result.analysisResult };
  } catch {
    return { status: "error", code: "DATABASE_ERROR" };
  }
}
