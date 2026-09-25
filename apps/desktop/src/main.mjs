import {app,BrowserWindow,Menu,Tray,nativeImage,ipcMain,shell,dialog,safeStorage} from 'electron';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createConfigStore} from './config-store.mjs';
import {startServer} from './server-process.mjs';
import {verifyProjectKeys,inspectDatabase} from './supabase-inspection.mjs';
import {runCli} from './supabase-cli.mjs';
import {createMigrationSession,prepareMigrationDirectory} from './migration-session.mjs';
import {createSetupController} from './setup-controller.mjs';
import {createDispatcher} from './ipc.mjs';
import {assessUpgrade} from './upgrade.mjs';
import {publicDiagnostic} from './diagnostic.mjs';
import {failure,publicFailure} from './errors.mjs';

app.setName('Freelance Cashflow');
const source=dirname(fileURLToPath(import.meta.url));
const uiPath=join(source,'ui','index.html');
const expectedUrl=pathToFileURL(uiPath).href;
const resources=app.isPackaged?process.resourcesPath:join(source,'..','resources');
let window,tray,controller,quitting=false,notice=null;
async function showWindow(){
 if(window&&!window.isDestroyed()){window.show();window.focus();return;}
 window=new BrowserWindow({width:880,height:790,minWidth:650,minHeight:620,title:'Installer Freelance Cashflow',
  backgroundColor:'#f5f7f3',webPreferences:{preload:join(source,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',event=>event.preventDefault());
 window.on('close',event=>{
  if(quitting)return;
  if(controller?.getState().running){event.preventDefault();window.hide();return;}
  const choice=dialog.showMessageBoxSync(window,{type:'question',message:'Quitter la configuration ?',buttons:['Continuer','Quitter'],defaultId:0,cancelId:0});
  event.preventDefault();if(choice===1)app.quit();
 });
 await window.loadFile(uiPath);
}
async function openApp(){try{if(controller?.getState().running)await controller.open();else await showWindow();}catch(error){notice=publicFailure(error).code;await showWindow();}}
if(!app.requestSingleInstanceLock())app.quit();
else {
 app.on('second-instance',()=>{void openApp();});
 app.on('activate',()=>{void openApp();});
 app.on('window-all-closed',()=>{});
 app.on('before-quit',event=>{
  if(quitting)return;event.preventDefault();quitting=true;
  Promise.resolve(controller?.quit()).finally(()=>app.quit());
 });
 app.whenReady().then(async()=>{
 try {
  const manifest=JSON.parse(await readFile(join(resources,'migration-manifest.json'),'utf8'));
  const schemaHash=createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  const store=createConfigStore({directory:app.getPath('userData'),
   encryptString:value=>{if(!safeStorage.isEncryptionAvailable())throw failure('ENCRYPTION_UNAVAILABLE');return safeStorage.encryptString(value);},
   decryptString:bytes=>safeStorage.decryptString(bytes)});
  const cliPath=join(resources,'runtimes',process.platform==='win32'?'supabase.exe':'supabase');
  const session=createMigrationSession({
   inspect:input=>inspectDatabase({config:input.config,accessToken:input.credentials.accessToken,manifest,signal:input.signal}),
   prepare:()=>prepareMigrationDirectory({migrationsDirectory:join(resources,'migrations'),manifest}),
   run:(args,dir,input)=>runCli({cliPath,args,cwd:dir.cwd,credentials:input.credentials,signal:input.signal})});
  controller=createSetupController({schemaHash,store,verifyKeys:(config,options)=>verifyProjectKeys(config,fetch,options),session,
   launch:(config,{signal})=>startServer({signal,nodePath:join(resources,'runtimes',process.platform==='win32'?'node.exe':'node'),
    serverPath:join(resources,'web','apps','web','server.js'),config,dataDirectory:app.getPath('userData')}),
   open:url=>shell.openExternal(url)});
  const links={dashboard:'https://supabase.com/dashboard',tokens:'https://supabase.com/dashboard/account/tokens',backup:'https://supabase.com/docs/guides/platform/backups'};
  ipcMain.handle('cashflow:setup',createDispatcher({getWindow:()=>window,expectedUrl,handlers:{
   getState:async()=>({...controller.getState(),notice:notice??controller.getState().notice}),
   retryStart:async()=>{const saved=await store.read();if(!saved||!assessUpgrade({savedSchemaHash:saved.schemaHash,packagedSchemaHash:schemaHash}).canStart)throw failure('SCHEMA_CHECK_REQUIRED');return controller.startSaved(saved);},
   inspect:input=>controller.inspect(input),apply:input=>controller.apply(input),saveAndStart:input=>controller.saveAndStart(input),
   open:()=>controller.open(),quit:async()=>{app.quit();},
   openSupabase:async name=>{
    let url=links[name];
    if(name==='project'){const ref=controller.getState().projectRef;if(ref)url='https://supabase.com/dashboard/project/'+ref+'/auth/url-configuration';}
    if(!url)throw failure('INVALID_LINK');await shell.openExternal(url);
   }
  }}));
  const menu=Menu.buildFromTemplate([{label:'Freelance Cashflow',submenu:[
   {label:'Ouvrir',click:()=>void openApp()},
   {label:'Diagnostic',click:()=>{void dialog.showMessageBox({type:'info',message:'Diagnostic Freelance Cashflow',
    detail:JSON.stringify(publicDiagnostic({version:app.getVersion(),platform:process.platform,...controller.getState()}),null,2)});}},
   {type:'separator'},{label:'Quitter',click:()=>app.quit()}]},
   {role:'editMenu'}]);
  Menu.setApplicationMenu(menu);
  tray=new Tray(nativeImage.createFromPath(join(source,'ui','tray.png')));
  tray.setToolTip('Freelance Cashflow');tray.setContextMenu(menu);tray.on('double-click',()=>void openApp());
  try {
   if(quitting)return;
   const saved=await store.read();
   if(saved&&assessUpgrade({savedSchemaHash:saved.schemaHash,packagedSchemaHash:schemaHash}).canStart)await controller.startSaved(saved);
   else {if(saved)notice='SCHEMA_CHECK_REQUIRED';await showWindow();}
  } catch(error){if(!quitting){notice=publicFailure(error).code;await showWindow();}}
 }catch{
  await dialog.showMessageBox({type:'error',message:'Installation incomplète',detail:'Réinstallez Freelance Cashflow avec le fichier téléchargé. Les données Supabase sont conservées.'});
  app.quit();
 }
 });
}
