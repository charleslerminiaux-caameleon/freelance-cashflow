// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), read: vi.fn(), configured: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("./direct-config", () => ({ loadDirectConfig: mocks.configured }));
vi.mock("@fc/integrations/server", async importOriginal => ({
  ...await importOriginal<typeof import("@fc/integrations/server")>(),
  createPennylaneProvider: () => ({ readInvoices: mocks.read }),
}));
import { synchronizeDirectForOwner } from "./direct-sync";
import { IntegrationError } from "@fc/integrations/server";
const owner = "11111111-1111-4111-8111-111111111111";
const calls: string[] = [];
beforeEach(() => {
 vi.clearAllMocks(); calls.length = 0;
 mocks.configured.mockReturnValue({token:"fixture-only"});
 mocks.read.mockImplementation(async()=>{calls.push("read");return {invoices:[],skippedDrafts:1,skippedCreditNotes:2};});
 mocks.rpc.mockImplementation((name:string, args:Record<string,unknown>) => {
   calls.push(name);
   const data = name === "acquire_direct_banking_sync" ? {
     integration_id:"33333333-3333-4333-8333-333333333333",run_id:args.p_run_id,
     initial_created_from:"2026-03-01",initial_created_from_instant:"2026-03-01T00:00:00Z",updated_from:"2026-03-01T00:00:00Z",updated_to:"2026-09-21T00:00:00Z",
   } : name === "publish_pennylane_sync" ? {created:0,updated:0} : null;
   return {abortSignal:()=>Promise.resolve({data,error:null})};
 });
});
it("publishes only a complete snapshot under the owner lease",async()=>{
 expect(await synchronizeDirectForOwner(owner,"pennylane")).toEqual({success:true,created:0,updated:0,skippedDrafts:1,skippedCreditNotes:2});
 expect(calls).toEqual(["acquire_direct_banking_sync","read","publish_pennylane_sync"]);
 expect(mocks.rpc).toHaveBeenLastCalledWith("publish_pennylane_sync",expect.objectContaining({p_owner_user_id:owner,p_invoices:[]}));
});
it("never publishes failed provider reads and records a sanitized failure",async()=>{
 mocks.read.mockRejectedValue(new IntegrationError("PROVIDER_AUTH_EXPIRED"));
 expect(await synchronizeDirectForOwner(owner,"pennylane")).toEqual({success:false,code:"PROVIDER_AUTH_EXPIRED"});
 expect(calls).toEqual(["acquire_direct_banking_sync","fail_banking_sync"]);
});
it("refuses unconfigured access before database or HTTP work",async()=>{
 mocks.configured.mockReturnValue(null);
 expect((await synchronizeDirectForOwner(owner,"pennylane")).success).toBe(false);
 expect(calls).toEqual([]);
});
it("does not call the API when the lease is held by another run",async()=>{
 mocks.rpc.mockImplementation(()=>({abortSignal:()=>Promise.resolve({data:null,error:{code:"P0001",message:"SYNC_LOCKED"},status:400})}));
 expect(await synchronizeDirectForOwner(owner,"pennylane")).toEqual({success:false,code:"SYNC_LOCKED"});expect(mocks.read).not.toHaveBeenCalled();
});
it("replays publication with the same run when the committed response is lost", async () => {
 const normal = mocks.rpc.getMockImplementation()!;
 let lost = false;
 mocks.rpc.mockImplementation((name:string,args:Record<string,unknown>)=>{
  if(name==='publish_pennylane_sync'&&!lost){lost=true;return {abortSignal:()=>Promise.resolve({data:null,error:{code:'',message:'transport'},status:0})};}
  return normal(name,args);
 });
 expect((await synchronizeDirectForOwner(owner,'pennylane')).success).toBe(true);
 const publish=mocks.rpc.mock.calls.filter(([name])=>name==='publish_pennylane_sync');
 expect(publish).toHaveLength(2);expect(publish[0]?.[1]).toEqual(publish[1]?.[1]);
 expect(calls).not.toContain('fail_banking_sync');
});
