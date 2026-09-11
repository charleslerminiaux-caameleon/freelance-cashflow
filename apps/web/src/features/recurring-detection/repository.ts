import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { confirmationSchema, detectionErrorCode, uuid, type ConfirmSuggestionInput } from "./schema";
export { getRecurringSuggestionWorkspace, listConfirmedRecurringSuggestions } from "./workspace";
export { createAnalysisStore } from "./store";

export async function confirmSuggestion(client: SupabaseClient, ownerId: string, input: ConfirmSuggestionInput): Promise<string> {
  const parsed = confirmationSchema.safeParse(input);
  if (!uuid.safeParse(ownerId).success || !parsed.success) throw new Error("DETECTION_INVALID");
  const command = parsed.data;
  try {
    // ownerId validates server input only. The authenticated RPC obtains its
    // authorization exclusively from auth.uid(), never from this argument.
    const { data, error } = await client.rpc("confirm_recurring_suggestion", {
      p_suggestion_id: command.suggestionId, p_source_publication: command.sourcePublication,
      p_command: command.command, p_existing_expense_id: command.existingExpenseId ?? null,
      p_allow_duplicate: command.allowDuplicate ?? false,
    });
    if (error) throw error;
    return uuid.parse(data);
  } catch (error) { throw new Error(detectionErrorCode(error)); }
}
export async function setSuggestionState(client: SupabaseClient, ownerId: string, id: string, action: "dismiss" | "reexamine"): Promise<void> {
  if (!uuid.safeParse(ownerId).success || !uuid.safeParse(id).success || !z.enum(["dismiss", "reexamine"]).safeParse(action).success) throw new Error("DETECTION_INVALID");
  try {
    const { error } = await client.rpc("set_recurring_suggestion_state", { p_suggestion_id: id, p_action: action });
    if (error) throw error;
  } catch (error) { throw new Error(detectionErrorCode(error)); }
}
