import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {auditPackage} from './package-audit.mjs';
const desktop=fileURLToPath(new URL('..',import.meta.url));
const signed=process.argv.includes('--signed');
if(!['darwin','win32'].includes(process.platform)||!['arm64','x64'].includes(process.arch)||process.platform==='win32'&&process.arch!=='x64')throw Error('Unsupported native build platform');
if(signed){
 for(const name of ['CSC_LINK','CSC_KEY_PASSWORD',...(process.platform==='darwin'?['MAC_SIGNING_IDENTITY','APPLE_ID','APPLE_APP_SPECIFIC_PASSWORD','APPLE_TEAM_ID']:[])]){
  if(!process.env[name])throw Error('Missing signing setting: '+name);
 }
}
await auditPackage(join(desktop,'resources'));
const builder=fileURLToPath(new URL('../node_modules/electron-builder/cli.js',import.meta.url));
await new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[builder,'--config',signed?'electron-builder-release.yml':'electron-builder.yml',
  process.platform==='darwin'?'--mac':'--win','--'+process.arch,'--publish','never'],
  {cwd:desktop,shell:false,stdio:'inherit',env:{...process.env,...(!signed?{CSC_IDENTITY_AUTO_DISCOVERY:'false'}:{})}});
 child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Packaging failed')));
});
const dist=join(desktop,'dist'),lines=[];
for(const filename of await readdir(dist)){
 if(!/\.(dmg|exe)$/.test(filename))continue;
 lines.push(createHash('sha256').update(await readFile(join(dist,filename))).digest('hex')+'  '+filename);
}
await writeFile(join(dist,'SHA256SUMS.txt'),lines.join('\n')+'\n');
console.log(signed?'Signed artifacts generated; validate on target OS before publishing.':'Unsigned test artifacts generated; not a public release.');
