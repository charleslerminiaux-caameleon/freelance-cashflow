// Read-only regression: PostgreSQL's search_path must not change schema identity.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {contractQuery,contractHash} from '../src/schema-contract.mjs';
function snapshot(searchPath){
 const sql='BEGIN READ ONLY; SET LOCAL search_path = '+searchPath+'; '+contractQuery+'; COMMIT;';
 const r=spawnSync('docker',['exec','-i','supabase_db_jalon-2-qonto-tests','psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:sql,encoding:'utf8'});
 assert.equal(r.status,0,'Read-only schema query must succeed');return JSON.parse(r.stdout.trim());
}
const withExtensions=snapshot('public, extensions'),withoutExtensions=snapshot('pg_catalog');
assert.equal(contractHash(withExtensions),contractHash(withoutExtensions),'Identical schema must have identical hash across session search paths');
console.log('PASS: schema fingerprint is independent of the database session search_path.');
