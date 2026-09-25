import {readdir,readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {failure} from '../src/errors.mjs';
export async function auditPackage(directory){
 let count=0;
 async function visit(path){
  for(const entry of await readdir(path,{withFileTypes:true})){
   if(/^\.env(?:\.|$)/.test(entry.name)||['.libra','credentials','vault.key','bunq-context.json','config.json'].includes(entry.name)&&!path.includes('node_modules'))throw failure('PRIVATE_FILE_IN_PACKAGE','packaging');
   const child=join(path,entry.name),stat=await lstat(child);
   if(stat.isSymbolicLink())throw failure('SYMLINK_IN_PACKAGE','packaging');
   if(entry.isDirectory())await visit(child);
   else{
    count++;
    if(/\.(js|json|html|map|mjs)$/.test(entry.name)&&stat.size<20*1024*1024){
     const text=await readFile(child,'utf8');
     if(/sb_secret_[a-zA-Z0-9_-]{20,}/.test(text)||/sbp_[a-f0-9]{40}/.test(text))throw failure('SECRET_IN_PACKAGE','packaging');
    }
   }
  }
 }
 await visit(directory);if(!count)throw failure('EMPTY_PACKAGE','packaging');return count;
}
