import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { getQontoIntegration } from "./repository";
const owner = "11111111-1111-4111-8111-111111111111";
function client(data: unknown, error: unknown = null) {
 const query = { abortSignal: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data, error }) };
 return { query, db: { from: vi.fn(() => query) } };
}
it("reads only public control fields with owner and provider predicates", async () => {
 const {db, query} = client({ id: owner, status: "error", last_connection_succeeded: true, last_success_at: "2026-09-10T10:00:00+00:00", last_error_code: "DATABASE_ERROR", raw: "private" });
 const result = await getQontoIntegration(db as unknown as SupabaseClient, owner);
 expect(db.from).toHaveBeenCalledWith("integrations"); expect(query.eq).toHaveBeenCalledWith("owner_user_id", owner); expect(query.eq).toHaveBeenCalledWith("provider", "qonto");
 expect(query.select.mock.calls[0]?.[0]).not.toMatch(/\*|lease|secret/); expect(result?.last_connection_succeeded).toBe(true); expect(result).not.toHaveProperty("raw");
});
it("supports no prior attempt", async () => { const {db} = client(null); expect(await getQontoIntegration(db as unknown as SupabaseClient, owner)).toBeNull(); });
it.each([{status: "raw-private"}, null])("sanitizes invalid rows and database errors", async (row) => {
 const {db} = client(row, row === null ? { message: "private" } : null);
 await expect(getQontoIntegration(db as unknown as SupabaseClient, owner)).rejects.toThrow("DATABASE_ERROR");
});
