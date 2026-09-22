"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/require-owner";
import { synchronizeDirectForOwner } from "./direct-sync";
import type { DirectProvider } from "./direct-config";
import type { SyncActionState } from "./integration-panel";
import { integrationMessages } from "./status";

async function synchronize(provider: DirectProvider): Promise<SyncActionState> {
  const { userId } = await requireOwner();
  const name = { pennylane: "Pennylane", revolut: "Revolut Business", bunq: "bunq" }[provider];
  let state: SyncActionState;
  try {
    const result = await synchronizeDirectForOwner(userId, provider);
    state = result.success ? { success: true,
      message: `Synchronisation ${name} terminée : ${result.created} ajout(s), ${result.updated} mise(s) à jour.`
        + (provider === "pennylane" ? ` ${result.skippedDrafts ?? 0} brouillon(s) et ${result.skippedCreditNotes ?? 0} avoir(s) non importés.` : ""),
    } : { success: false, message: integrationMessages[result.code].replaceAll("Qonto", name) };
  } catch { state = { success: false, message: integrationMessages.DATABASE_ERROR }; }
  for (const path of ["/integrations", "/cashflow", "/dashboard", "/invoices", "/customers"]) revalidatePath(path);
  revalidatePath("/", "layout");
  return state;
}
export async function syncPennylaneAction(_state: SyncActionState, _form: FormData) { void _state; void _form; return synchronize("pennylane"); }
export async function syncRevolutAction(_state: SyncActionState, _form: FormData) { void _state; void _form; return synchronize("revolut"); }
export async function syncBunqAction(_state: SyncActionState, _form: FormData) { void _state; void _form; return synchronize("bunq"); }
