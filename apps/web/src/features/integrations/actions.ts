"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/require-owner";
import { isQontoConfigured } from "./qonto-config";
import { synchronizeQontoForOwner } from "./sync-qonto";
import { integrationMessages } from "./status";
import type { SyncActionState } from "./integration-panel";

export async function syncQontoAction(
  _previousState: SyncActionState,
  _formData: FormData,
): Promise<SyncActionState> {
  const { userId } = await requireOwner();
  // This action accepts no client-controlled command or owner identifier.
  void _previousState;
  void _formData;
  if (!isQontoConfigured()) return { success: false, message: "Configurez la connexion Qonto dans Intégrations avant de synchroniser." };
  let state: SyncActionState;
  try {
    const result = await synchronizeQontoForOwner(userId);
    if (result.success && result.skipped) return { success: false, message: null };
    state = result.success
      ? {
          success: true,
          message: "Synchronisation Qonto terminée.",
          analysisSuccess: result.analysisResult.success,
          analysisMessage: result.analysisResult.success
            ? `Analyse des récurrences terminée : ${result.analysisResult.count} détectée${result.analysisResult.count === 1 ? "" : "s"}.`
            : "Données Qonto actualisées, analyse des récurrences à relancer.",
        }
      : { success: false, message: integrationMessages[result.code] };
  } catch {
    state = { success: false, message: integrationMessages.DATABASE_ERROR };
  }
  revalidatePath("/integrations");
  revalidatePath("/cashflow");
  revalidatePath("/dashboard");
  revalidatePath("/expenses");
  revalidatePath("/", "layout");
  return state;
}
