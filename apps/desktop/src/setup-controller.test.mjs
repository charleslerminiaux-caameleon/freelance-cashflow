import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSetupController} from './setup-controller.mjs';
const ref='abcdefghijklmnopqrst',key=role=>'e30.'+Buffer.from(JSON.stringify({role,ref})).toString('base64url')+'.sig';
const input={mode:'new',url:'https://'+ref+'.supabase.co',anonKey:key('anon'),serviceRoleKey:key('service_role'),accessToken:'transient-token',databasePassword:'transient-password'};
test('does not expose or save credentials before confirmed setup',async()=>{
 let saved=null,opened=false,stopped=false;
 const controller=createSetupController({manifest:[],schemaHash:'schema',store:{write:async value=>{saved=value;}},
  verifyKeys:async()=>{},session:{preview:async()=>({kind:'empty',pending:[],fingerprint:'fingerprint'}),
   apply:async()=>({kind:'compatible',pending:[]}),clear(){}},
  launch:async()=>({origin:'http://localhost:3000',stop:async()=>{stopped=true;}}),open:async()=>{opened=true;}});
 await assert.rejects(controller.saveAndStart({authConfirmed:true}),e=>e.code==='INVALID_STEP');
 await controller.inspect(input);assert.equal(saved,null);
 const serialized=JSON.stringify(controller.getState());
 assert.equal(serialized.includes('transient-token'),false);assert.equal(serialized.includes(input.serviceRoleKey),false);
 await controller.apply({fingerprint:'fingerprint'});
 await controller.saveAndStart({authConfirmed:true});
 assert.equal(opened,true);assert.equal(saved.schemaHash,'schema');
 await controller.quit();assert.equal(stopped,true);
});
test('preserves the saved installation when startup fails',async()=>{
 let writes=0;
 const controller=createSetupController({manifest:[],schemaHash:'schema',store:{write:async()=>{writes++;}},
  verifyKeys:async()=>{},session:{preview:async()=>({kind:'empty',pending:[],fingerprint:'f'}),apply:async()=>({kind:'compatible',pending:[],fingerprint:'f'}),clear(){}},
  launch:async()=>{throw Error('startup failed');},open:async()=>{}});
 await controller.inspect(input);await controller.apply({fingerprint:'f'});
 await assert.rejects(controller.saveAndStart({authConfirmed:true}));assert.equal(writes,0);
});
