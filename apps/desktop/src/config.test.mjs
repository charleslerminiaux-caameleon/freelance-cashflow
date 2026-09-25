import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig} from './config.mjs';
const ref='abcdefghijklmnopqrst';
const token=role => Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({role,ref})).toString('base64url')+'.signature';
const valid={url:'https://'+ref+'.supabase.co',anonKey:token('anon'),serviceRoleKey:token('service_role')};
test('validates legacy roles and binds both keys to the selected project',()=>{
 assert.equal(validateConfig(valid).projectRef,ref);
 for(const url of ['http://'+ref+'.supabase.co','https://'+ref+'.supabase.co.attacker.test','https://user:password@'+ref+'.supabase.co',valid.url+'/path',valid.url+'?x=1']){
  assert.throws(()=>validateConfig({...valid,url}),e=>e.code==='INVALID_CONFIGURATION');
 }
 assert.throws(()=>validateConfig({...valid,anonKey:valid.serviceRoleKey}));
 assert.throws(()=>validateConfig({...valid,url:'https://bbbbbbbbbbbbbbbbbbbb.supabase.co'}));
});
export {valid};
