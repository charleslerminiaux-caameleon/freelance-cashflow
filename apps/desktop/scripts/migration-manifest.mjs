import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export async function migrationManifest(directory,{contracts=true}={}) {
 const rows=[];
 for(const filename of await readdir(directory)){
  if(!filename.endsWith('.sql'))continue;
  const match=/^(\d+)_[a-z0-9_]+\.sql$/.exec(filename);if(!match)throw Error('INVALID_MIGRATION_NAME');
  const sql=await readFile(join(directory,filename),'utf8');
  rows.push({version:match[1],filename,sha256:createHash('sha256').update(sql).digest('hex'),
   tables:[...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_0-9]+)/gi)].map(m=>m[1]),
   functions:[...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_0-9]+)/gi)].map(m=>m[1])});
 }
 rows.sort((a,b)=>a.version<b.version?-1:a.version>b.version?1:0);
 if(!rows.length||new Set(rows.map(r=>r.version)).size!==rows.length)throw Error('INVALID_MIGRATION_MANIFEST');
 if(contracts){
  const saved=JSON.parse(await readFile(new URL('../schema-contracts.json',import.meta.url),'utf8'));
  if(saved.format!==1||saved.entries.length!==rows.length)throw Error('SCHEMA_CONTRACTS_STALE');
  for(const row of rows){const entry=saved.entries.find(e=>e.version===row.version&&e.sha256===row.sha256);
   if(!entry||!/^[a-f0-9]{64}$/.test(entry.contractHash))throw Error('SCHEMA_CONTRACTS_STALE');row.contractHash=entry.contractHash;}
 }
 return rows;
}
