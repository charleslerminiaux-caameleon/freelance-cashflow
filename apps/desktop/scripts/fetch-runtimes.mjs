import {createHash} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {mkdir,readFile,cp,chmod,mkdtemp,rm,access,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {failure} from '../src/errors.mjs';
export async function verifyDownload(path,expected){
 const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);
 if(hash.digest('hex')!==expected)throw failure('CHECKSUM_MISMATCH','packaging');
}
export function selectRuntime(manifest,platform,arch){
 const target=manifest.targets?.[platform+'-'+arch];if(!target)throw failure('UNSUPPORTED_PLATFORM','packaging');return target;
}
async function command(exe,args){await new Promise((resolve,reject)=>{const child=spawn(exe,args,{shell:false,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(failure('EXTRACTION_FAILED')));});}
export async function fetchRuntimes({manifest,destination,cache,platform=process.platform,arch=process.arch}){
 const target=selectRuntime(manifest,platform,arch);await mkdir(destination,{recursive:true});await mkdir(cache,{recursive:true});
 for(const [name,item] of Object.entries(target)){
  const archive=join(cache,item.sha256+(item.url.endsWith('.zip')?'.zip':'.tar.gz'));
  try{await access(archive);await verifyDownload(archive,item.sha256);}
  catch{
   await rm(archive,{force:true});
   const response=await fetch(item.url,{signal:AbortSignal.timeout(180000)});
   if(!response.ok||!response.body)throw failure('DOWNLOAD_FAILED','packaging');
   try{await pipeline(response.body,createWriteStream(archive,{flags:'wx'}));await verifyDownload(archive,item.sha256);}
   catch(error){await rm(archive,{force:true});throw error;}
  }
  const extraction=await mkdtemp(join(cache,'extract-'));
  try{
   await command('tar',['-xf',archive,'-C',extraction,item.binary,...(item.companions??[]),...(item.license?[item.license]:[])]);
   await cp(join(extraction,item.binary),join(destination,item.output));
   await chmod(join(destination,item.output),0o755);
   for(const companion of item.companions??[]){await cp(join(extraction,companion),join(destination,companion));await chmod(join(destination,companion),0o755);}
   if(item.license)await cp(join(extraction,item.license),join(destination,name+'-LICENSE'));
   else {const response=await fetch(item.licenseUrl,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw failure('LICENSE_DOWNLOAD_FAILED');const path=join(destination,name+'-LICENSE');await writeFile(path,Buffer.from(await response.arrayBuffer()));await verifyDownload(path,item.licenseSha256);}
  }finally{await rm(extraction,{recursive:true,force:true});}
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const desktop=fileURLToPath(new URL('..',import.meta.url));
 await fetchRuntimes({manifest:JSON.parse(await readFile(join(desktop,'runtime-manifest.json'),'utf8')),destination:join(desktop,'resources','runtimes'),cache:join(desktop,'.runtime-cache')});
}
