import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
async function visit(dir) {
 for(const entry of await readdir(dir,{withFileTypes:true})) {
  const path=join(dir,entry.name);
  if(entry.isDirectory())await visit(path);
  else if(/\.(mjs|cjs)$/.test(path)) {
   const result=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});
   if(result.status!==0)process.exit(result.status??1);
  }
 }
}
await visit('src'); await visit('scripts');
