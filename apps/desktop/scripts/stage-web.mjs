import {cp,mkdir,rm,access,readdir,lstat,realpath,copyFile,chmod} from 'node:fs/promises';
import {join,basename,resolve,dirname,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
// Materialize pnpm package links with their own dependency neighborhood. A plain
// dereference moves a package away from the node_modules that resolves its imports.
function escapes(root,target){const path=relative(root,target);return path==='..'||path.startsWith('..'+sep)||isAbsolute(path);}
async function materialize(source,destination,root,tracingRoot,ancestors=new Set()){
 if(/^\.env(?:\.|$)/.test(basename(source))||['.libra','credentials'].includes(basename(source)))return;
 const info=await lstat(source);
 if(info.isSymbolicLink()){
  let target=await realpath(source);
  if(escapes(root,target)){
   // Windows junctions copied by Next retain their absolute checkout targets.
   // Use only the corresponding traced copy, never the original dependency.
   if(escapes(tracingRoot,target))throw Error('Standalone link escapes its root');
   target=await realpath(join(root,relative(tracingRoot,target)));
   if(escapes(root,target))throw Error('Standalone link escapes its root');
  }
  if(ancestors.has(target))return;
  const next=new Set(ancestors);next.add(target);
  await materialize(target,destination,root,tracingRoot,next);
  const marker=sep+'node_modules'+sep+'.pnpm'+sep;
  if(target.includes(marker)){
   const rest=target.slice(target.indexOf(marker)+marker.length);
   const parts=rest.split(sep);
   if(parts[1]==='node_modules'&&(parts.length===3||parts.length===4&&parts[2].startsWith('@'))){
    const neighborhood=target.slice(0,target.indexOf(marker)+marker.length)+parts[0]+sep+'node_modules';
    for(const entry of await readdir(neighborhood,{withFileTypes:true})){
     if(entry.name.startsWith('.'))continue;
     const dependency=join(neighborhood,entry.name);
     if(entry.name.startsWith('@')){
      for(const scoped of await readdir(dependency)){
       const path=join(dependency,scoped);
       if(!next.has(await realpath(path)))await materialize(path,join(destination,'node_modules',entry.name,scoped),root,tracingRoot,next);
      }
     }else if(!next.has(await realpath(dependency))){
      await materialize(dependency,join(destination,'node_modules',entry.name),root,tracingRoot,next);
     }
    }
   }
  }
 }else if(info.isDirectory()){
  await mkdir(destination,{recursive:true});
  for(const entry of await readdir(source))await materialize(join(source,entry),join(destination,entry),root,tracingRoot,ancestors);
 }else{
  await mkdir(dirname(destination),{recursive:true});await copyFile(source,destination);await chmod(destination,info.mode);
 }
}
export async function stageWeb({webRoot,destination,distDir='.next-desktop',tracingRoot=resolve(webRoot,'../..')}) {
 const source=join(webRoot,distDir,'standalone');
 await access(join(source,'apps','web','server.js'));
 await rm(destination,{recursive:true,force:true});await mkdir(destination,{recursive:true});
 await materialize(source,destination,await realpath(source),await realpath(tracingRoot));
 const web=join(destination,'apps','web');
 await cp(join(webRoot,'public'),join(web,'public'),{recursive:true,filter:path=>!/^\.env(?:\.|$)/.test(basename(path))});
 await cp(join(webRoot,distDir,'static'),join(web,distDir,'static'),{recursive:true});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const webRoot=fileURLToPath(new URL('../../web/',import.meta.url));
 await stageWeb({webRoot,destination:fileURLToPath(new URL('../resources/web',import.meta.url))});
}
