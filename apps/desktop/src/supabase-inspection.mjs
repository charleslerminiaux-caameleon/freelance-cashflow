import {createHash} from 'node:crypto';
import {contractQuery,contractHash} from './schema-contract.mjs';
import {failure} from './errors.mjs';
export const inventoryQuery = `select
 coalesce((select jsonb_agg(c.relname order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p','v','m','f')
 and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')),'[]'::jsonb) as tables,
 coalesce((select jsonb_agg(distinct p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')),'[]'::jsonb) as functions,
 to_regclass('supabase_migrations.schema_migrations') is not null as has_history,
 coalesce((select jsonb_agg(n.nspname order by n.nspname) from pg_namespace n
 where n.nspname not like 'pg_%' and n.nspname not in ('public','information_schema','auth','storage','extensions','realtime','_realtime','graphql','graphql_public','supabase_functions','supabase_migrations','vault','net','cron','pgbouncer','pgmq','pgmq_public')
 and exists(select 1 from pg_class c where c.relnamespace=n.oid and c.relkind in ('r','p','v','m','f'))
 and not exists(select 1 from pg_depend d where d.classid='pg_namespace'::regclass and d.objid=n.oid and d.deptype='e')),'[]'::jsonb) as foreign_schemas`;
export const historyQuery='select version from supabase_migrations.schema_migrations order by version';
export function classifyDatabase({tables,functions,versions,manifest,foreignSchemas=[],structuralHash}) {
 const pending=manifest.filter(m=>!versions.includes(m.version));
 const prefix=manifest.slice(0,versions.length).map(m=>m.version);
 const applied=manifest.filter(m=>versions.includes(m.version));
 const expectedTables=[...new Set(applied.flatMap(m=>m.tables))];
 const expectedFunctions=[...new Set(applied.flatMap(m=>m.functions))];
 const allTables=new Set(expectedTables), allFunctions=new Set(expectedFunctions);
 const unknown=tables.some(t=>!allTables.has(t))||functions.some(f=>!allFunctions.has(f));
 const incomplete=expectedTables.some(t=>!tables.includes(t))||expectedFunctions.some(f=>!functions.includes(f));
 const ordered=[...versions].sort();
 const contractMismatch=versions.length&&applied.at(-1)?.contractHash!==undefined&&applied.at(-1).contractHash!==structuralHash;
 const invalid=contractMismatch||foreignSchemas.length||unknown||incomplete||new Set(versions).size!==versions.length||
  JSON.stringify(prefix)!==JSON.stringify(ordered)||(!versions.length&&(tables.length||functions.length));
 return {kind:invalid?'incompatible':!versions.length?'empty':pending.length?'pending':'compatible',pending};
}
async function jsonRequest(request,url,options) {
 let response;
 try {response=await request(url,{...options,redirect:'error',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});}
 catch {throw failure('SUPABASE_UNAVAILABLE','database');}
 if(!response.ok)throw failure(response.status===401||response.status===403?'SUPABASE_ACCESS_DENIED':'SUPABASE_UNAVAILABLE','database');
 try{return await response.json();}catch{throw failure('SUPABASE_INVALID_RESPONSE','database');}
}
export async function verifyProjectKeys(config,request=fetch,{signal}={}) {
 for(const [key,path] of [[config.anonKey,'/auth/v1/settings'],[config.serviceRoleKey,'/auth/v1/admin/users?page=1&per_page=1']]){
  let response;
  try {response=await request(config.url+path,{headers:{apikey:key,Authorization:'Bearer '+key},redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});}
  catch {throw failure('SUPABASE_UNAVAILABLE');}
  await response.body?.cancel();
  if(!response.ok)throw failure('SUPABASE_ACCESS_DENIED');
 }
}
export async function inspectDatabase({config,accessToken,manifest,request=fetch,signal}) {
 const query=sql=>jsonRequest(request,'https://api.supabase.com/v1/projects/'+config.projectRef+'/database/query',
  {signal,method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({query:sql,read_only:true})});
 const rows=await query(inventoryQuery); const snapshot=rows?.[0];
 if(!snapshot||![snapshot.tables,snapshot.functions,snapshot.foreign_schemas].every(a=>Array.isArray(a)&&a.every(x=>typeof x==='string'))||typeof snapshot.has_history!=='boolean')throw failure('SUPABASE_INVALID_RESPONSE');
 const history=snapshot.has_history?await query(historyQuery):[];
 if(!Array.isArray(history)||history.some(h=>typeof h.version!=='string'))throw failure('SUPABASE_INVALID_RESPONSE');
 const catalog=await query(contractQuery);
 let structuralHash;try{structuralHash=contractHash(catalog?.[0]?.contract);}catch{throw failure('SUPABASE_INVALID_RESPONSE');}
 if(history.length&&manifest.some(m=>!m.contractHash))throw failure('INVALID_MIGRATION_MANIFEST');
 const state={structuralHash,tables:[...snapshot.tables].sort(),functions:[...snapshot.functions].sort(),versions:history.map(h=>h.version).sort(),foreignSchemas:[...snapshot.foreign_schemas].sort(),manifest};
 const result=classifyDatabase(state);
 return {...result,projectRef:config.projectRef,fingerprint:createHash('sha256').update(JSON.stringify({projectRef:config.projectRef,...state})).digest('hex')};
}
