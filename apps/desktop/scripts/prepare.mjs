import {readFile,writeFile,mkdir,cp,access} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {stageWeb} from './stage-web.mjs';
import {fetchRuntimes} from './fetch-runtimes.mjs';
import {migrationManifest} from './migration-manifest.mjs';
import {auditPackage} from './package-audit.mjs';
const root=fileURLToPath(new URL('../../..',import.meta.url)),desktop=join(root,'apps','desktop'),web=join(root,'apps','web'),resources=join(desktop,'resources');
for(const directory of [root,web])for(const name of ['.env','.env.local','.env.production','.env.production.local']){
 try{await access(join(directory,name));throw Error('Build desktop requires a clean checkout without local environment files');}
 catch(error){if(error.code!=='ENOENT')throw error;}
}
const buildEnv={...process.env,FC_DESKTOP_BUILD:'1',NEXT_TELEMETRY_DISABLED:'1',
 NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:56321',NEXT_PUBLIC_SUPABASE_ANON_KEY:'FAKE_PUBLIC_BUILD_ONLY',
 SUPABASE_SERVICE_ROLE_KEY:'FAKE_SERVICE_ROLE_BUILD_ONLY',QONTO_LOGIN:'FAKE_QONTO_LOGIN_ACCEPTANCE_ONLY',QONTO_SECRET_KEY:'FAKE_QONTO_SECRET_ACCEPTANCE_ONLY'};
const next=fileURLToPath(new URL('../../web/node_modules/next/dist/bin/next',import.meta.url));
await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[next,'build'],{cwd:web,env:buildEnv,stdio:'inherit',shell:false});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Web build failed')));});
await mkdir(resources,{recursive:true});
await stageWeb({webRoot:web,destination:join(resources,'web')});
const migrationDirectory=join(root,'supabase','migrations');
await cp(migrationDirectory,join(resources,'migrations'),{recursive:true});
await writeFile(join(resources,'migration-manifest.json'),JSON.stringify(await migrationManifest(migrationDirectory),null,2)+'\n');
await cp(join(root,'LICENSE'),join(resources,'LICENSE'));
await fetchRuntimes({manifest:JSON.parse(await readFile(join(desktop,'runtime-manifest.json'),'utf8')),destination:join(resources,'runtimes'),cache:join(desktop,'.runtime-cache')});
await auditPackage(resources);
console.log('Desktop resources prepared and audited.');
