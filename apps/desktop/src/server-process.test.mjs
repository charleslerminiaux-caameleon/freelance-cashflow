import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHmac} from 'node:crypto';
import {startServer} from './server-process.mjs';
function fixture() {
 const child=new EventEmitter(); child.exitCode=null; let kills=0; let options;
 child.kill=()=>{kills++;child.exitCode=0;queueMicrotask(()=>child.emit('exit',0));return true;};
 return {child,get kills(){return kills;},get options(){return options;},
  input:{nodePath:'/fake Node/node',serverPath:'/fake Web/server.js',dataDirectory:'/tmp/Équipe Cashflow',
   config:{url:'https://test.supabase.co',anonKey:'public',serviceRoleKey:'secret'},
   spawnProcess:(_exe,_args,opts)=>{options=opts;return child;},assertPortFree:async()=>{},
   timeoutMs:30,fetchHealth:async(_url,opts)=>({ok:true,json:async()=>({application:'freelance-cashflow',
    proof:createHmac('sha256',options.env.FC_DESKTOP_HEALTH_TOKEN).update(opts.headers['x-fc-challenge']).digest('hex')})})}};
}
test('authenticates own server and stops only its owned child idempotently',async()=>{
 const f=fixture(); const running=await startServer(f.input);
 assert.equal(running.origin,'http://localhost:3000');
 assert.equal(f.options.shell,false); assert.equal(f.options.env.HOSTNAME,'127.0.0.1');
 await running.stop();await running.stop();assert.equal(f.kills,1);
});
test('rejects a foreign response even with the expected product name',async()=>{
 const f=fixture();
 await assert.rejects(startServer({...f.input,fetchHealth:async()=>({ok:true,json:async()=>({application:'freelance-cashflow',proof:'0'.repeat(64)})})}), e=>e.code==='SERVER_IDENTITY_MISMATCH');
 assert.equal(f.kills,1);
});
test('does not touch another process occupying the port',async()=>{
 const f=fixture();
 await assert.rejects(startServer({...f.input,assertPortFree:async()=>{throw Object.assign(Error(),{code:'PORT_IN_USE'});}}),e=>e.code==='PORT_IN_USE');
 assert.equal(f.options,undefined);assert.equal(f.kills,0);
});
test('bounds unreachable health and cleans up its child',async()=>{
 const f=fixture();await assert.rejects(startServer({...f.input,fetchHealth:async()=>{throw Error('secret');}}),e=>e.code==='SERVER_TIMEOUT');
 assert.equal(f.kills,1);
});
test('cancels a launch during health wait and releases both loopback ports',async()=>{
 const f=fixture(),abort=new AbortController();let checking;
 const waiting=new Promise(resolve=>{checking=resolve;});
 const launch=startServer({...f.input,timeoutMs:2000,signal:abort.signal,fetchHealth:async(_url,{signal})=>{
  checking();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));
 }});
 const rejected=assert.rejects(launch,e=>e.code==='OPERATION_CANCELLED');await waiting;abort.abort();await rejected;
 assert.equal(f.kills,1);
});
test('a handle refuses identity checks after its owned child exits',async()=>{
 const f=fixture();const running=await startServer(f.input);
 f.child.exitCode=1;f.child.emit('exit',1);
 assert.equal(running.isAlive(),false);await assert.rejects(running.check(),e=>e.code==='SERVER_EXITED');await running.stop();
});
