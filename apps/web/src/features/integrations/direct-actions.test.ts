import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({owner:vi.fn(),sync:vi.fn(),revalidate:vi.fn()}));
vi.mock('@/lib/auth/require-owner',()=>({requireOwner:mocks.owner}));
vi.mock('./direct-sync',()=>({synchronizeDirectForOwner:mocks.sync}));
vi.mock('next/cache',()=>({revalidatePath:mocks.revalidate}));
import { syncPennylaneAction, syncRevolutAction, syncBunqAction } from './direct-actions';
beforeEach(()=>{vi.clearAllMocks();mocks.owner.mockResolvedValue({userId:'session-owner'});mocks.sync.mockResolvedValue({success:true,created:2,updated:0});});
it.each([syncPennylaneAction,syncRevolutAction,syncBunqAction])('authenticates before synchronization',async action=>{
 mocks.owner.mockRejectedValue(new Error('unauthorized'));
 await expect(action({success:false,message:null},new FormData())).rejects.toThrow('unauthorized');
 expect(mocks.sync).not.toHaveBeenCalled();
});
it('ignores forged owner/provider and reports skipped records explicitly',async()=>{
 const form = new FormData(); form.set('owner','forged');form.set('provider','qonto');
 mocks.sync.mockResolvedValue({success:true,created:2,updated:0,skippedDrafts:1,skippedCreditNotes:2});
 const result=await syncPennylaneAction({success:false,message:null},form);
 expect(mocks.sync).toHaveBeenCalledWith('session-owner','pennylane');
 expect(result.success).toBe(true);expect(result.message).toMatch(/1 brouillon/);expect(result.message).toMatch(/2 avoir/);
 expect(mocks.revalidate).toHaveBeenCalledWith('/invoices');
});
it('sanitizes unexpected errors',async()=>{mocks.sync.mockRejectedValue(new Error('secret-token'));const result=await syncBunqAction({success:false,message:null},new FormData());expect(result.success).toBe(false);expect(result.message).not.toContain('secret-token');});
