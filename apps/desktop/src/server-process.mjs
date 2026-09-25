import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createServer as createHttpServer,request} from 'node:http';
import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {failure} from './errors.mjs';
export function runtimeEnvironment(source=process.env) {
 return Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','LANG','PATH'].filter(k=>source[k]).map(k=>[k,source[k]]));
}
const unavailable=error=>['EAFNOSUPPORT','EADDRNOTAVAIL'].includes(error.code);
export async function assertPortFree(port=3000) {
 for(const host of ['127.0.0.1','::1'])await new Promise((resolve,reject)=>{
  const probe=createServer();
  probe.once('error',error=>host==='::1'&&unavailable(error)?resolve():reject(failure('PORT_IN_USE','launch')));
  probe.listen({port,host,ipv6Only:true,exclusive:true},()=>probe.close(resolve));
 });
}
export async function startServer({nodePath,serverPath,config,dataDirectory,spawnProcess=spawn,
 fetchHealth=fetch,assertPortFree:checkPort=assertPortFree,timeoutMs=30000,port=3000,signal}) {
 const guard=()=>{if(signal?.aborted)throw failure('OPERATION_CANCELLED','launch');};
 guard();await checkPort(port);guard();
 await mkdir(dataDirectory,{recursive:true,mode:0o700});guard();
 let exited=false,ready=false;
 // Reserve IPv6 for the entire lifetime: localhost must never resolve to a foreign listener.
 const gateway=createHttpServer((incoming,outgoing)=>{
  if(!ready||exited){outgoing.writeHead(503).end();return;}
  const forwarded=request({hostname:'127.0.0.1',port,path:incoming.url,method:incoming.method,headers:incoming.headers},response=>{
   outgoing.writeHead(response.statusCode,response.headers);response.pipe(outgoing);
  });
  forwarded.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(503);outgoing.end();});
  incoming.on('aborted',()=>forwarded.destroy());outgoing.on('close',()=>forwarded.destroy());incoming.pipe(forwarded);
 });
 await new Promise((resolve,reject)=>{
  gateway.once('error',error=>unavailable(error)?resolve():reject(failure('PORT_IN_USE','launch')));
  gateway.listen({host:'::1',port,ipv6Only:true,exclusive:true},resolve);
 });
 const closeGateway=()=>{ready=false;gateway.closeAllConnections();if(gateway.listening)gateway.close();};
 const secret=randomBytes(32).toString('hex');
 let child;
 try{
  guard();
  child=spawnProcess(nodePath,[serverPath],{shell:false,windowsHide:true,cwd:dataDirectory,
   stdio:['ignore','ignore','ignore'],env:{...runtimeEnvironment(),NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:String(port),
    FC_SUPABASE_URL:config.url,FC_SUPABASE_ANON_KEY:config.anonKey,SUPABASE_SERVICE_ROLE_KEY:config.serviceRoleKey,
    FC_DESKTOP_HEALTH_TOKEN:secret,INTEGRATION_CREDENTIALS_DIR:join(dataDirectory,'credentials'),
    BUNQ_CONTEXT_PATH:join(dataDirectory,'bunq-context.json')}});
 }catch(error){closeGateway();throw error;}
 let stopping;
 const exit=new Promise(resolve=>{const done=()=>{exited=true;closeGateway();resolve();};child.once('exit',done);child.once('error',done);});
 const isAlive=()=>!exited&&child.exitCode===null&&!stopping;
 const stop=()=>stopping??=(async()=>{
  closeGateway();signal?.removeEventListener('abort',onAbort);
  if(exited||child.exitCode!==null)return;
  child.kill('SIGTERM');let timer;
  await Promise.race([exit,new Promise(resolve=>{timer=setTimeout(resolve,5000);})]);clearTimeout(timer);
  if(!exited){child.kill('SIGKILL');await exit;}
 })();
 const onAbort=()=>{void stop();};signal?.addEventListener('abort',onAbort,{once:true});
 async function check(){
  guard();if(!isAlive())throw failure('SERVER_EXITED','launch');
  const challenge=randomBytes(32).toString('hex');
  const response=await fetchHealth('http://127.0.0.1:'+port+'/api/desktop-health',{
   headers:{'x-fc-challenge':challenge},redirect:'error',
   signal:signal?AbortSignal.any([signal,AbortSignal.timeout(1000)]):AbortSignal.timeout(1000)});
  if(!response.ok)throw failure('SERVER_NOT_READY','launch');
  const body=await response.json().catch(()=>null);
  const expected=createHmac('sha256',secret).update(challenge).digest();
  const proof=typeof body?.proof==='string'&&/^[a-f0-9]{64}$/.test(body.proof)?Buffer.from(body.proof,'hex'):Buffer.alloc(0);
  if(body?.application!=='freelance-cashflow'||proof.length!==expected.length||!timingSafeEqual(proof,expected))throw failure('SERVER_IDENTITY_MISMATCH','launch');
  guard();if(!isAlive())throw failure('SERVER_EXITED','launch');
 }
 try{
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
   guard();if(!isAlive())throw failure('SERVER_EXITED','launch');
   try{await check();ready=true;return {origin:'http://localhost:'+port,stop,check,isAlive};}
   catch(error){if(['SERVER_IDENTITY_MISMATCH','SERVER_EXITED','OPERATION_CANCELLED'].includes(error.code))throw error;}
   await delay(Math.min(100,timeoutMs));
  }
  throw failure('SERVER_TIMEOUT','launch');
 }catch(error){await stop();throw error;}
}
