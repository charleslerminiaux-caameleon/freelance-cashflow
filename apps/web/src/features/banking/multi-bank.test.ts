// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';
import { getBankingSnapshot } from './repository';
const owner = '11111111-1111-4111-8111-111111111111';
const ids = ['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
it('brackets all bank publications and paginates history globally across published providers', async () => {
 let generation=1, changed=false;
 const historyFilters:string[]=[];
 const client=createClient('https://example.invalid','synthetic-key',{auth:{persistSession:false},global:{fetch:async(input)=>{
  const url=new URL(String(input));const table=url.pathname.split('/').at(-1);
  let rows:unknown[]=[];
  if(table==='integrations') rows=ids.map((id,i)=>({id,provider:i?'bunq':'revolut',status:'connected',last_connection_succeeded:true,last_error_code:null,last_success_at:`2026-09-10T10:00:00.00000${i?generation:1}Z`}));
  if(table==='bank_accounts') rows=ids.map(id=>({id,name:'Bank',iban_masked:null,currency:'EUR',current_balance_cents:generation*100,available_balance_cents:null,status:'active',is_current:true,updated_at:'2026-09-10T10:00:00Z'}));
  if(table==='bank_transactions') {historyFilters.push(url.searchParams.get('integration_id')!);expect(url.searchParams.get('offset')).toBe('50');expect(url.searchParams.get('order')).toBe('transaction_date.desc,id.desc'); if(!changed){changed=true;generation++;}}
  return new Response(JSON.stringify(rows),{headers:{'Content-Type':'application/json','Content-Range':'0-0/101'}});
 }}});
 const result=await getBankingSnapshot(client,owner,{historyPage:2});
 expect(result.accounts.map(a=>a.current_balance_cents)).toEqual([200,200]);
 expect(result.history.hasNext).toBe(true);
 expect(historyFilters).toEqual([`in.(${ids.join(',')})`,`in.(${ids.join(',')})`]);
});
it('isolates a provider-scoped publication for Qonto recurring detection', async () => {
 const seen:string[]=[]; const providers: (string|null)[]=[];
 const client=createClient('https://example.invalid','synthetic-key',{auth:{persistSession:false},global:{fetch:async(input)=>{
  const url=new URL(String(input));const table=url.pathname.split('/').at(-1);
  seen.push(table!);
  expect(url.searchParams.get('owner_user_id')).toBe(`eq.${owner}`);
  if(table==='integrations') {
   providers.push(url.searchParams.get('provider'));
   return new Response(JSON.stringify([{id:ids[0],provider:'qonto',status:'connected',last_success_at:null,last_connection_succeeded:true,last_error_code:null}]),{headers:{'Content-Type':'application/json'}});
  }
  throw new Error('Unpublished integration must not query bank rows');
 }}});
 const result=await getBankingSnapshot(client,owner,{provider:'qonto',historyPage:2});
 expect(result.accounts).toEqual([]);
 expect(result.history).toEqual({items:[],page:2,hasNext:false});
 expect(result.integrations?.map(row=>row.provider)).toEqual(['qonto']);
 expect(seen).toEqual(['integrations','integrations']);
 expect(providers).toEqual(['eq.qonto','eq.qonto']);
});
