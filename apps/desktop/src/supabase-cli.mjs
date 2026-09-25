import {spawn} from 'node:child_process';
import {runtimeEnvironment} from './server-process.mjs';
import {failure} from './errors.mjs';
export function runCli({cliPath,args,cwd,credentials,spawnProcess=spawn,timeoutMs=180000}) {
 return new Promise((resolve,reject)=>{
  const child=spawnProcess(cliPath,args,{cwd,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],
   env:{...runtimeEnvironment(),SUPABASE_ACCESS_TOKEN:credentials.accessToken??'',SUPABASE_DB_PASSWORD:credentials.databasePassword??''}});
  let output='',size=0,problem;
  const timer=setTimeout(()=>{problem=failure('CLI_TIMEOUT','database');child.kill('SIGKILL');},timeoutMs);
  const consume=chunk=>{size+=chunk.length;if(size>1024*1024){problem=failure('CLI_OUTPUT_LIMIT','database');child.kill('SIGKILL');}};
  child.stdout.on('data',chunk=>{consume(chunk);if(!problem)output+=chunk;});
  child.stderr.on('data',consume);
  child.once('error',()=>{clearTimeout(timer);reject(failure('CLI_UNAVAILABLE','database'));});
  child.once('close',code=>{clearTimeout(timer);if(problem)reject(problem);else if(code!==0)reject(failure('CLI_FAILED','database'));else resolve(output);});
 });
}
