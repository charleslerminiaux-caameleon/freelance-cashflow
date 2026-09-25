import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyDownload,selectRuntime} from './fetch-runtimes.mjs';
test('rejects corrupted downloads and unsupported architecture before execution',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'fc-download-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,'archive');await writeFile(path,'tampered');
 await assert.rejects(verifyDownload(path,'0'.repeat(64)),e=>e.code==='CHECKSUM_MISMATCH');
 assert.throws(()=>selectRuntime({},'linux','x64'),e=>e.code==='UNSUPPORTED_PLATFORM');
});
