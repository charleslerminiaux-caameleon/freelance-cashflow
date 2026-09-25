import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {failure} from './errors.mjs';
export async function prepareMigrationDirectory({migrationsDirectory,manifest,temporaryRoot=tmpdir()}) {
 const cwd=await mkdtemp(join(temporaryRoot,'fc-setup-'));
 try {
  const target=join(cwd,'supabase','migrations');await mkdir(target,{recursive:true,mode:0o700});
  await writeFile(join(cwd,'supabase','config.toml'),'project_id = "freelance-cashflow-desktop"\n',{mode:0o600});
  for(const item of manifest){
   if(!/^\d+_[a-z0-9_]+\.sql$/.test(item.filename))throw failure('INVALID_MIGRATION_MANIFEST');
   const bytes=await readFile(join(migrationsDirectory,item.filename));
   if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw failure('MIGRATIONS_CHANGED');
   await writeFile(join(target,item.filename),bytes,{mode:0o600});
  }
  return {cwd,dispose:()=>rm(cwd,{recursive:true,force:true})};
 } catch(error){await rm(cwd,{recursive:true,force:true});throw error;}
}
function guard(input){if(input.signal?.aborted)throw failure('OPERATION_CANCELLED');}
export function createMigrationSession({inspect,run,prepare}) {
 let preview=null;let busy=false;
 async function exclusively(fn){if(busy)throw failure('OPERATION_BUSY');busy=true;try{return await fn();}finally{busy=false;}}
 return {
  preview(input){return exclusively(async()=>{
   guard(input);preview=null;const current=await inspect(input);guard(input);
   if(current.kind==='incompatible')throw failure('INCOMPATIBLE_DATABASE');
   if(current.pending.length) {
    guard(input);const dir=await prepare(input);
    try{guard(input);await run(['link','--project-ref',input.config.projectRef],dir,input);
     guard(input);await run(['db','push','--linked','--dry-run'],dir,input);
    }finally{await dir.dispose();}
   }
   guard(input);preview=current;return current;
  });},
  apply(input){return exclusively(async()=>{
   guard(input);if(!preview||preview.fingerprint!==input.confirmedFingerprint)throw failure('PREVIEW_REQUIRED');
   const approved=preview;
   if(approved.kind==='pending'&&!input.backupVerified)throw failure('BACKUP_REQUIRED');
   preview=null;
   const current=await inspect(input);guard(input);
   if(current.kind==='incompatible'||current.fingerprint!==approved.fingerprint)throw failure('DATABASE_CHANGED');
   if(!current.pending.length)return current;
   guard(input);const dir=await prepare(input);
   try {
    guard(input);await run(['link','--project-ref',input.config.projectRef],dir,input);
    // Re-inspect after CLI link and immediately before mutating.
    const latest=await inspect(input);guard(input);
    if(latest.fingerprint!==approved.fingerprint)throw failure('DATABASE_CHANGED');
    guard(input);await run(['db','push','--linked','--yes'],dir,input);
    const result=await inspect(input);
    if(result.kind!=='compatible')throw failure('DATABASE_VERIFICATION_FAILED');
    return result;
   } finally {await dir.dispose();}
  });},
  clear(){preview=null;}
 };
}
