import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createConfigStore} from './config-store.mjs';
const config={url:'https://abcdefghijklmnopqrst.supabase.co',anonKey:'public',serviceRoleKey:'secret-canary',projectRef:'abcdefghijklmnopqrst'};
test('persists only ciphertext and keeps the last config after an unsuccessful replacement',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'Équipe Cashflow ')); t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=createConfigStore({directory,encryptString:()=>Buffer.from('protected'),decryptString:()=>config.serviceRoleKey});
 assert.equal(await store.read(),null); await store.write(config);
 assert.equal((await store.read()).serviceRoleKey,'secret-canary');
 const path=join(directory,'config.json'); const before=await readFile(path,'utf8');
 assert.equal(before.includes('secret-canary'),false);
 const broken=createConfigStore({directory,encryptString:()=>{throw Error('secret-canary');},decryptString:()=>''});
 await assert.rejects(broken.write({...config,url:'https://changed.supabase.co'}), e=>e.code==='CONFIGURATION_SAVE_FAILED'&&!e.message.includes('secret-canary'));
 assert.equal(await readFile(path,'utf8'),before);
 await writeFile(path,'{"version":999}'); await assert.rejects(store.read(),e=>e.code==='CONFIGURATION_UNREADABLE');
});
