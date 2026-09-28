import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {stageWeb} from './stage-web.mjs';
test('stages the standalone with assets and without private files',async t=>{
 const root=await mkdtemp(join(tmpdir(),'fc-stage-'));t.after(()=>rm(root,{force:true,recursive:true}));
 const webRoot=join(root,'web'),destination=join(root,'bundle');
 const files={'.next-desktop/standalone/apps/web/server.js':'server','.next-desktop/standalone/apps/web/.env.local':'secret','public/icon.svg':'icon','.next-desktop/static/chunk.js':'chunk'};
 for(const [name,value] of Object.entries(files)){const p=join(webRoot,name);await mkdir(join(p,'..'),{recursive:true});await writeFile(p,value);}
 await stageWeb({webRoot,destination});
 assert.equal(await readFile(join(destination,'apps/web/.next-desktop/static/chunk.js'),'utf8'),'chunk');
 await assert.rejects(access(join(destination,'apps/web/.env.local')));
});

test('materializes pnpm packages without losing their sibling dependency resolution',async t=>{
 const root=await mkdtemp(join(tmpdir(),'fc-pnpm-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const webRoot=join(root,'web'),destination=join(root,'bundle');
 const standalone=join(webRoot,'.next-desktop/standalone');
 const files={'apps/web/server.js':"console.log(require('parent-package'))",'node_modules/.pnpm/parent@1/node_modules/parent-package/index.js':"module.exports=require('child-package')",'node_modules/.pnpm/child@1/node_modules/child-package/index.js':"module.exports='works'"};
 for(const [name,value] of Object.entries(files)){const path=join(standalone,name);await mkdir(join(path,'..'),{recursive:true});await writeFile(path,value);}
 await mkdir(join(standalone,'apps/web/node_modules'),{recursive:true});
 await symlink('../../../node_modules/.pnpm/parent@1/node_modules/parent-package',join(standalone,'apps/web/node_modules/parent-package'),'dir');
 await symlink('../../child@1/node_modules/child-package',join(standalone,'node_modules/.pnpm/parent@1/node_modules/child-package'),'dir');
 await mkdir(join(webRoot,'public'));await mkdir(join(webRoot,'.next-desktop/static'));
 await stageWeb({webRoot,destination});
 const {spawnSync}=await import('node:child_process');
 const result=spawnSync(process.execPath,[join(destination,'apps/web/server.js')],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'works');
});

test('rebases absolute build links to traced copies and rejects unrelated external links',async t=>{
 const root=await mkdtemp(join(tmpdir(),'fc-absolute-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const webRoot=join(root,'apps/web'),destination=join(root,'bundle');
 const standalone=join(webRoot,'.next-desktop/standalone');
 const packagePath='node_modules/.pnpm/example@1/node_modules/example';
 for(const [path,value] of [[join(standalone,'apps/web/server.js'),'server'],[join(root,packagePath,'index.js'),'untraced'],[join(standalone,packagePath,'index.js'),'traced']]){
  await mkdir(join(path,'..'),{recursive:true});await writeFile(path,value);
 }
 await mkdir(join(webRoot,'public'));await mkdir(join(webRoot,'.next-desktop/static'));
 const modules=join(standalone,'apps/web/node_modules');await mkdir(modules,{recursive:true});
 await symlink(join(root,packagePath),join(modules,'example'),'junction');
 await stageWeb({webRoot,destination});
 assert.equal(await readFile(join(destination,'apps/web/node_modules/example/index.js'),'utf8'),'traced');
 const outside=await mkdtemp(join(tmpdir(),'fc-outside-'));t.after(()=>rm(outside,{recursive:true,force:true}));
 await symlink(outside,join(modules,'outside'),'junction');
 await assert.rejects(stageWeb({webRoot,destination}),/Standalone link escapes its root/);
});
