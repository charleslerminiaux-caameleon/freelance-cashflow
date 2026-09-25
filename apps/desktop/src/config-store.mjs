import {mkdir,readFile,open,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {failure} from './errors.mjs';
export function createConfigStore({directory,encryptString,decryptString}) {
 const destination=join(directory,'config.json');
 return {
  async read() {
   let raw;
   try {raw=await readFile(destination,'utf8');} catch(error) {if(error.code==='ENOENT')return null; throw failure('CONFIGURATION_UNREADABLE');}
   try {
    const saved=JSON.parse(raw);
    if(saved.version!==1||!['url','anonKey','projectRef','encryptedServiceRoleKey'].every(k=>typeof saved[k]==='string'))throw Error();
    return {url:saved.url,anonKey:saved.anonKey,projectRef:saved.projectRef,schemaHash:saved.schemaHash,
     serviceRoleKey:decryptString(Buffer.from(saved.encryptedServiceRoleKey,'base64'))};
   } catch {throw failure('CONFIGURATION_UNREADABLE');}
  },
  async write(config,{signal}={}) {
   let temp;
   try {
    const encryptedServiceRoleKey=encryptString(config.serviceRoleKey).toString('base64');
    const saved={version:1,url:config.url,anonKey:config.anonKey,projectRef:config.projectRef,schemaHash:config.schemaHash,encryptedServiceRoleKey};
    await mkdir(directory,{recursive:true,mode:0o700});
    temp=join(directory,randomUUID()+'.tmp');
    const file=await open(temp,'wx',0o600);
    try {await file.writeFile(JSON.stringify(saved));await file.sync();} finally {await file.close();}
    if(signal?.aborted)throw failure('OPERATION_CANCELLED');
    await rename(temp,destination);
   } catch {throw failure('CONFIGURATION_SAVE_FAILED');}
   finally {if(temp)await rm(temp,{force:true}).catch(()=>{});}
  }
 };
}
