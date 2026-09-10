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
  if (!isQontoConfigured()) return { success: false, message: "Qonto est à configurer sur le serveur avant de synchroniser." };
  let state: SyncActionState;
  try {
    const result = await synchronizeQontoForOwner(userId);
    state = result.success
      ? { success: true, message: "Synchronisation Qonto terminée." }
      : { success: false, message: integrationMessages[result.code] };
  } catch {
    state = { success: false, message: integrationMessages.DATABASE_ERROR };
  }
  revalidatePath("/integrations");
  revalidatePath("/cashflow");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
  return state;
}
