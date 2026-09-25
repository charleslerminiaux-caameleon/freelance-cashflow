import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {runtimeEnvironment} from './server-process.mjs';
import {failure} from './errors.mjs';
export function runCli({cliPath,args,cwd,credentials,spawnProcess=spawn,timeoutMs=180000,signal}) {
 if(signal?.aborted)return Promise.reject(failure('OPERATION_CANCELLED'));
 return new Promise((resolve,reject)=>{
  const child=spawnProcess(cliPath,args,{cwd,shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],
   env:{...runtimeEnvironment(),SUPABASE_ACCESS_TOKEN:credentials.accessToken??'',SUPABASE_DB_PASSWORD:credentials.databasePassword??''}});
  let output='',size=0,problem;
  let terminating;
  const terminate=()=>terminating??=(async()=>{
   if(!child.pid)return;
   if(process.platform==='win32'){
    await new Promise(resolve=>{const killer=spawn(join(process.env.SystemRoot??'C:\\Windows','System32','taskkill.exe'),['/pid',String(child.pid),'/T','/F'],{shell:false,windowsHide:true,stdio:'ignore'});killer.once('error',resolve);killer.once('close',resolve);});
   }else{try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}}
  })();
  const timer=setTimeout(()=>{problem=failure('CLI_TIMEOUT','database');void terminate();},timeoutMs);
  const cancel=()=>{problem=failure('OPERATION_CANCELLED');void terminate();};
  signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);};
  const consume=chunk=>{size+=chunk.length;if(size>1024*1024){problem=failure('CLI_OUTPUT_LIMIT','database');void terminate();}};
  child.stdout.on('data',chunk=>{consume(chunk);if(!problem)output+=chunk;});
  child.stderr.on('data',consume);
  child.once('error',()=>{cleanup();reject(failure('CLI_UNAVAILABLE','database'));});
  child.once('close',async code=>{await terminating;cleanup();if(problem)reject(problem);else if(code!==0)reject(failure('CLI_FAILED','database'));else resolve(output);});
 });
}
