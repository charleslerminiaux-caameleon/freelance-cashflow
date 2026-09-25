import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {auditPackage} from './package-audit.mjs';
test('rejects private environment and credential files in staged packages',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'fc-audit-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await writeFile(join(dir,'server.js'),'safe');await auditPackage(dir);
 for(const name of ['.env.local','vault.key','bunq-context.json']){
  await writeFile(join(dir,name),'private');
  await assert.rejects(auditPackage(dir),e=>e.code==='PRIVATE_FILE_IN_PACKAGE');await rm(join(dir,name));
 }
});
