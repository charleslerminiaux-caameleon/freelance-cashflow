import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { generateKeyPairSync } from "node:crypto";
import { synchronizeDirectForOwner } from "../src/features/integrations/direct-sync";
import { getBankingSnapshot } from "../src/features/banking/repository";
import { listInvoices } from "../src/features/invoices/repository";

if (process.env.E2E_STACK_PROJECT !== "jalon-2-qonto-tests" || process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:56321") throw new Error("Dedicated test database required");
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
let owner: string;
let unpaid = "20.10";
let reject = false;
const localFetch = globalThis.fetch;
beforeAll(async () => {
 const {count,error}=await client.from("app_settings").select("*",{count:"exact",head:true});
 if(error||count!==0)throw new Error("Refusing existing singleton owner");
 const {data,error:createError}=await client.auth.admin.createUser({email:"direct-integration@example.test",email_confirm:true});
 if(createError||!data.user)throw new Error("Fixture owner failed");owner=data.user.id;
 const {error:settingsError}=await client.from("app_settings").insert({owner_user_id:owner});if(settingsError)throw new Error("Fixture settings failed");
 vi.stubEnv("PENNYLANE_API_TOKEN","synthetic-pennylane");
 vi.stubEnv("REVOLUT_CLIENT_ID","synthetic-client");vi.stubEnv("REVOLUT_REFRESH_TOKEN","synthetic-refresh");vi.stubEnv("REVOLUT_ISSUER","example.test");
 vi.stubEnv("REVOLUT_PRIVATE_KEY",generateKeyPairSync("rsa",{modulusLength:2048}).privateKey.export({type:"pkcs8",format:"pem"}).toString());
 vi.stubGlobal("fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.origin==='http://127.0.0.1:56321')return localFetch(input,init);
  const json=(value:unknown)=>new Response(JSON.stringify(value));
  if(url.origin==='https://app.pennylane.com'){
   if(reject)return new Response('{}',{status:401});
   if(url.pathname.endsWith('/customers/42'))return json({id:42,name:'Synthetic Customer'});
   return json({items:[{id:1,invoice_number:'PL-SYNTHETIC',currency:'EUR',currency_amount:'120.30',currency_amount_before_tax:'100.25',currency_tax:'20.05',date:'2026-09-01',deadline:'2026-09-30',paid:false,status:'partially_paid',remaining_amount_with_tax:unpaid,draft:false,credited_invoice:null,customer:{id:42}}],has_more:false,next_cursor:null});
  }
  if(url.origin==='https://b2b.revolut.com'){
   if(url.pathname.endsWith('/auth/token'))return json({access_token:'synthetic-access',expires_in:2399,token_type:'bearer'});
   if(url.pathname.endsWith('/accounts'))return json([{id:'same-external-id',name:'Synthetic Revolut',balance:234.56,currency:'EUR',state:'active',updated_at:'2026-09-01T00:00:00Z'}]);
   if(url.pathname.endsWith('/transactions'))return json([{id:'tx-1',type:'transfer',state:'completed',created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z',legs:[{leg_id:'leg-1',account_id:'same-external-id',amount:-12.34,currency:'EUR',description:'Synthetic debit'}]}]);
  }
  throw new Error('Unmocked external request rejected');
 });
});
afterAll(async()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();if(owner){const {error}=await client.auth.admin.deleteUser(owner);if(error)throw new Error('Fixture cleanup failed');}});
test('direct API snapshots publish into actual invoice and banking views and survive failed refresh',async()=>{
 expect(await synchronizeDirectForOwner(owner,'pennylane')).toMatchObject({success:true,created:1,updated:0});
 expect((await listInvoices(client,owner))[0]).toMatchObject({provider:'pennylane',paid_amount_cents:10020,paid_at:null});
 unpaid='10.00';
 expect(await synchronizeDirectForOwner(owner,'pennylane')).toMatchObject({success:true,created:0,updated:1});
 expect((await listInvoices(client,owner))[0]?.paid_amount_cents).toBe(11030);
 reject=true;
 expect(await synchronizeDirectForOwner(owner,'pennylane')).toEqual({success:false,code:'PROVIDER_AUTH_EXPIRED'});
 expect((await listInvoices(client,owner))[0]?.paid_amount_cents).toBe(11030);
 expect(await synchronizeDirectForOwner(owner,'revolut')).toMatchObject({success:true,created:2});
 const banking=await getBankingSnapshot(client,owner,{historyPage:1});
 expect(banking.accounts[0]?.current_balance_cents).toBe(23456);
 expect(banking.history.items[0]).toMatchObject({amount_cents:1234,direction:'outflow'});
 expect(banking.integrations?.map(i=>i.provider)).toEqual(['revolut']);
});
