import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {failure} from './errors.mjs';
export function runtimeEnvironment(source=process.env) {
 return Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','LANG','PATH'].filter(k=>source[k]).map(k=>[k,source[k]]));
}
export function assertPortFree(port=3000) {
 return new Promise((resolve,reject)=>{
  const probe=createServer();
  probe.once('error',()=>reject(failure('PORT_IN_USE','launch')));
  probe.listen({port,host:'127.0.0.1',exclusive:true},()=>probe.close(resolve));
 });
}
export async function startServer({nodePath,serverPath,config,dataDirectory,spawnProcess=spawn,
 fetchHealth=fetch,assertPortFree:checkPort=assertPortFree,timeoutMs=30000,port=3000}) {
 await checkPort(port);
 await mkdir(dataDirectory,{recursive:true,mode:0o700});
 const secret=randomBytes(32).toString('hex');
 const child=spawnProcess(nodePath,[serverPath],{shell:false,windowsHide:true,cwd:dataDirectory,
  stdio:['ignore','ignore','ignore'],env:{...runtimeEnvironment(),NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:String(port),
   FC_SUPABASE_URL:config.url,FC_SUPABASE_ANON_KEY:config.anonKey,SUPABASE_SERVICE_ROLE_KEY:config.serviceRoleKey,
   FC_DESKTOP_HEALTH_TOKEN:secret,INTEGRATION_CREDENTIALS_DIR:join(dataDirectory,'credentials'),
   BUNQ_CONTEXT_PATH:join(dataDirectory,'bunq-context.json')}});
 let exited=false; let launchError=false; let stopping;
 const exit=new Promise(resolve=>{child.once('exit',()=>{exited=true;resolve();});child.once('error',()=>{launchError=true;exited=true;resolve();});});
 const stop=()=>stopping??=(async()=>{
  if(exited||child.exitCode!==null)return;
  child.kill('SIGTERM');
  let timer;
  await Promise.race([exit,new Promise(resolve=>{timer=setTimeout(resolve,5000);})]);clearTimeout(timer);
  if(!exited){child.kill('SIGKILL');await Promise.race([exit,delay(1000)]);}
 })();
 try {
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline) {
   if(exited||launchError||child.exitCode!==null)throw failure('SERVER_EXITED','launch');
   const challenge=randomBytes(32).toString('hex');
   let response;
   try {
    response=await fetchHealth('http://127.0.0.1:'+port+'/api/desktop-health',{
     headers:{'x-fc-challenge':challenge},redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(1000,deadline-Date.now())))});
   } catch {await delay(Math.min(100,timeoutMs));continue;}
   if(response.ok) {
    const body=await response.json().catch(()=>null);
    const expected=createHmac('sha256',secret).update(challenge).digest();
    const proof=typeof body?.proof==='string'&&/^[a-f0-9]{64}$/.test(body.proof)?Buffer.from(body.proof,'hex'):Buffer.alloc(0);
    if(body?.application!=='freelance-cashflow'||proof.length!==expected.length||!timingSafeEqual(proof,expected))throw failure('SERVER_IDENTITY_MISMATCH','launch');
    if(exited)throw failure('SERVER_EXITED','launch');
    return {origin:'http://localhost:'+port,stop};
   }
   await delay(Math.min(100,timeoutMs));
  }
  throw failure('SERVER_TIMEOUT','launch');
 } catch(error){await stop();throw error;}
}
