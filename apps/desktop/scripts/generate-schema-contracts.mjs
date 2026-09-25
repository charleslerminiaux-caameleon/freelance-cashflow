// Developer-only: build expected catalogs from migrations in a fresh disposable database.
import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {migrationManifest} from './migration-manifest.mjs';
import {contractQuery,contractHash} from '../src/schema-contract.mjs';
const container=process.env.FC_TEST_DB_CONTAINER??'supabase_db_jalon-2-qonto-tests';
const database='fc_installer_contract_'+process.pid;
function sql(query,db=database){
 const result=spawnSync('docker',['exec','-i',container,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],{input:query,encoding:'utf8',maxBuffer:16*1024*1024});
 if(result.status!==0)throw Error(result.stderr);
 return result.stdout.trim();
}
const directory=fileURLToPath(new URL('../../../supabase/migrations',import.meta.url));
const manifest=await migrationManifest(directory,{contracts:false});
sql('create database '+database,'postgres');
try{
 sql("create schema auth; create schema extensions; create table auth.users(id uuid primary key,email text,deleted_at timestamptz); create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;");
 const entries=[];
 for(const row of manifest){
  sql(await readFile(new URL('../../../supabase/migrations/'+row.filename,import.meta.url),'utf8'));
  const contract=JSON.parse(sql('begin read only;'+contractQuery+';commit;'));
  entries.push({version:row.version,sha256:row.sha256,contractHash:contractHash(contract)});
 }
 // Verify the rejection guarantees on real PostgreSQL without changing any existing database.
 const expected=entries.at(-1).contractHash;
 for(const change of [
  'alter table public.app_settings drop column country cascade',
  'alter table public.app_settings disable row level security',
  'drop function public.installation_diagnostic(); create function public.installation_diagnostic(integer) returns integer language sql as $$select $1$$'
 ]){
  const changed=JSON.parse(sql('begin;'+change+';'+contractQuery+';rollback;'));
  if(contractHash(changed)===expected)throw Error('Schema drift not detected: '+change);
 }
 await writeFile(new URL('../schema-contracts.json',import.meta.url),JSON.stringify({format:1,entries},null,2)+'\n');
 console.log('PASS: all migration prefixes generated; column, RLS and function drift detected in disposable PostgreSQL.');
}finally{sql('drop database '+database+' with (force)','postgres');}
