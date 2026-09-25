import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {startServer} from '../src/server-process.mjs';
import {auditPackage} from './package-audit.mjs';
import {checkClientBoundary} from '../../../scripts/check-client-boundary.mjs';
const resources=process.argv[2]??fileURLToPath(new URL('../resources',import.meta.url));
await auditPackage(resources);
const web=join(resources,'web','apps','web'),dist='.next-desktop';
await checkClientBoundary(join(web,dist,'static'),['FAKE_SERVICE_ROLE_BUILD_ONLY','RUNTIME_PRIVATE_CANARY']);
const directory=await mkdtemp(join(tmpdir(),'Freelance Cashflow smoke '));
async function availablePort(){return new Promise((resolve,reject)=>{const server=createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});}
try {
 for(const name of ['a','b']){
  const port=await availablePort(),config={url:'https://'+name.repeat(20)+'.supabase.co',anonKey:'public-'+name,serviceRoleKey:'RUNTIME_PRIVATE_CANARY'};
  const running=await startServer({nodePath:join(resources,'runtimes',process.platform==='win32'?'node.exe':'node'),
   serverPath:join(web,'server.js'),config,dataDirectory:directory,port,
   spawnProcess:(exe,args,options)=>spawn(exe,args,{...options,env:{...options.env,PATH:directory}})});
  try{
   const origin='http://127.0.0.1:'+port;
   const response=await fetch(origin+'/api/runtime-config');
   assert.deepEqual(await response.json(),{url:config.url,anonKey:config.anonKey});
   assert.equal(response.headers.get('cache-control'),'no-store');
   assert.equal((await fetch(origin+'/api/desktop-health')).status,404);
   const chunks=await readdir(join(web,dist,'static','chunks'));
   const asset=chunks.find(name=>name.endsWith('.js'));assert.ok(asset);
   assert.equal((await fetch(origin+'/_next/static/chunks/'+asset)).status,200);
  }finally{await running.stop();}
 }
 console.log('PASS: one staged build, two runtime configurations, bundled Node, no development PATH, served assets and clean shutdown.');
}finally{await rm(directory,{force:true,recursive:true});}
