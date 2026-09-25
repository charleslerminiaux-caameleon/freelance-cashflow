// Read-only verification against the existing, explicitly named disposable stack.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {migrationManifest} from './migration-manifest.mjs';
import {contractQuery,contractSelect} from '../src/schema-contract.mjs';
import {inspectDatabase} from '../src/supabase-inspection.mjs';
const container='supabase_db_jalon-2-qonto-tests';
const manifest=await migrationManifest(fileURLToPath(new URL('../../../supabase/migrations',import.meta.url)));
const result=await inspectDatabase({
 config:{projectRef:'abcdefghijklmnopqrst'},accessToken:'FAKE_LOCAL_ONLY',manifest,
 request:async(url,options)=>{
  assert.equal(url,'https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/database/query');
  const {query,read_only}=JSON.parse(options.body);assert.equal(read_only,true);
  const select=query===contractQuery?contractSelect:query;
  const prefix=query===contractQuery?'SET LOCAL search_path = pg_catalog; ':'';
  const sql='BEGIN READ ONLY; '+prefix+'SELECT coalesce(json_agg(snapshot),\'[]\'::json) FROM ('+select+') snapshot; COMMIT;';
  const process=spawnSync('docker',['exec',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-c',sql],{encoding:'utf8'});
  if(process.status!==0)throw Error('Read-only database probe failed');
  return {ok:true,json:async()=>JSON.parse(process.stdout)};
 }
});
assert.equal(result.kind,'compatible');
assert.equal(result.pending.length,0);
console.log('PASS: real disposable PostgreSQL catalog and migration history recognized as compatible.');
