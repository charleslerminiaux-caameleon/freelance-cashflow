import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {assertPortFree} from './server-process.mjs';
import {createSetupController} from './setup-controller.mjs';
import {runCli} from './supabase-cli.mjs';
const ref='abcdefghijklmnopqrst',key=role=>'e30.'+Buffer.from(JSON.stringify({role,ref})).toString('base64url')+'.sig';
const saved={url:'https://'+ref+'.supabase.co',anonKey:key('anon'),serviceRoleKey:key('service_role')};
test('rejects a foreign IPv6 listener while IPv4 is free',async t=>{
 const foreign=createServer();await new Promise((resolve,reject)=>{foreign.once('error',reject);foreign.listen({host:'::1',port:0,ipv6Only:true},resolve);}).catch(error=>{if(['EAFNOSUPPORT','EADDRNOTAVAIL'].includes(error.code))t.skip('IPv6 unavailable');else throw error;});
 if(!foreign.listening)return;
 try {await assert.rejects(assertPortFree(foreign.address().port),e=>e.code==='PORT_IN_USE');assert.equal(foreign.listening,true);}
 finally{await new Promise(resolve=>foreign.close(resolve));}
});
test('quit waits for pending startup and never navigates after it',async()=>{
 let finish,stops=0,opens=0;
 const controller=createSetupController({store:{},session:{clear(){}},launch:()=>new Promise(resolve=>{finish=resolve;}),open:async()=>{opens++;}});
 const starting=controller.startSaved(saved);const rejected=assert.rejects(starting);
 const quitting=controller.quit();
 finish({origin:'http://localhost:3000',stop:async()=>{stops++;}});
 await Promise.all([quitting,rejected]);
 assert.equal(controller.getState().running,false);assert.equal(stops,1);assert.equal(opens,0);
});
test('reopening authenticates the owned server and refuses a dead handle',async()=>{
 let alive=true,opens=0;
 const controller=createSetupController({store:{},session:{clear(){}},launch:async()=>({origin:'http://localhost:3000',isAlive:()=>alive,check:async()=>{if(!alive)throw Error('dead');},stop:async()=>{alive=false;}}),open:async()=>{opens++;}});
 await controller.startSaved(saved);alive=false;
 assert.equal(controller.getState().running,false);
 await controller.open();assert.equal(opens,1);
 await controller.quit();
});
test('aborting CLI waits until the owned process is closed',async()=>{
 const abort=new AbortController();let child;
 const running=runCli({cliPath:process.execPath,args:['-e','setInterval(()=>{},1000)'],cwd:process.cwd(),credentials:{},signal:abort.signal,
 spawnProcess:(...args)=>{child=spawn(...args);return child;},timeoutMs:2000});
 abort.abort();
 await assert.rejects(running,e=>e.code==='OPERATION_CANCELLED');
 assert.ok(child.exitCode!==null||child.signalCode!==null);
});
test('quit during configuration persistence waits and suppresses browser open',async()=>{
 let finish,entered,opens=0,alive=true;
 const writing=new Promise(resolve=>{entered=resolve;});
 const c=createSetupController({schemaHash:'x',store:{write:async()=>{entered();await new Promise(resolve=>{finish=resolve;});}},verifyKeys:async()=>{},
 session:{clear(){},preview:async()=>({kind:'empty',pending:[],fingerprint:'x'}),apply:async()=>({kind:'compatible',pending:[]})},
 launch:async()=>({origin:'http://localhost:3000',stop:async()=>{alive=false;}}),open:async()=>{opens++;}});
 await c.inspect({...saved,mode:'new',accessToken:'test',databasePassword:'test'});await c.apply({fingerprint:'x'});
 const task=c.saveAndStart({authConfirmed:true});const rejected=assert.rejects(task);await writing;
 const quitting=c.quit();finish();await Promise.all([quitting,rejected]);assert.equal(opens,0);assert.equal(alive,false);
});
