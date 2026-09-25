import {validateConfig} from './config.mjs';
import {failure} from './errors.mjs';
import {transition} from './wizard-state.mjs';
export function createSetupController({schemaHash,store,verifyKeys,session,launch,open}) {
 let step='welcome',config,credentials,inspection,running=null,expiry,closing=false,notice=null;
 const abort=new AbortController(),pending=new Set();
 function guard(){if(closing)throw failure('OPERATION_CANCELLED');}
 function forget(){config=undefined;credentials=undefined;clearTimeout(expiry);session.clear();}
 function requireStep(expected){if(step!==expected)throw failure('INVALID_STEP');}
 function state(){
  if(running?.isAlive?.()===false){running=null;step='welcome';notice='SERVER_EXITED';}
  return {step,notice,running:Boolean(running),projectRef:config?.projectRef,
   inspection:inspection?{kind:inspection.kind,fingerprint:inspection.fingerprint,pending:inspection.pending.map(m=>m.filename)}:null};
 }
 function operation(fn){guard();const task=fn();pending.add(task);task.finally(()=>pending.delete(task)).catch(()=>{});return task;}
 async function navigate(){
  guard();state();if(!running)return;
  const candidate=running;
  try{await candidate.check?.();guard();await open(candidate.origin);}
  catch(error){await candidate.stop();if(running===candidate){running=null;step='welcome';notice='SERVER_EXITED';}throw error;}
 }
 async function start(value,persist){
  guard();if(state().running){await navigate();return state();}
  const candidate=await launch(value,{signal:abort.signal});
  try{
   guard();running=candidate;
   if(persist){await store.write({...value,schemaHash},{signal:abort.signal});guard();}
   step='ready';notice=null;forget();await navigate();return state();
  }catch(error){await candidate.stop();if(running===candidate)running=null;throw error;}
 }
 return {
  getState:state,
  inspect(input){return operation(async()=>{
   if(state().running)throw failure('ALREADY_RUNNING');
   if(!input||!['new','existing'].includes(input.mode)||typeof input.accessToken!=='string'||!input.accessToken.trim()||
    input.accessToken.length>8192||typeof input.databasePassword!=='string'||input.databasePassword.length>8192)throw failure('INVALID_CONFIGURATION');
   forget();inspection=undefined;step='configuration';config=validateConfig(input);
   credentials={accessToken:input.accessToken.trim(),databasePassword:input.databasePassword};
   const attempt={config,credentials,signal:abort.signal};
   expiry=setTimeout(()=>{forget();inspection=undefined;if(step!=='ready')step='configuration';},15*60*1000);expiry.unref?.();
   await verifyKeys(attempt.config,{signal:abort.signal});guard();
   const result=await session.preview(attempt);guard();
   if(input.mode==='new'&&result.kind!=='empty')throw failure('PROJECT_NOT_EMPTY');
   if(input.mode==='existing'&&result.kind==='empty')throw failure('EMPTY_DATABASE');
   inspection=result;step=transition(step,'INSPECTED');return state();
  });},
  apply(input){return operation(async()=>{
   requireStep('preview');if(!config||!credentials)throw failure('SESSION_EXPIRED');
   if(input?.fingerprint!==inspection.fingerprint)throw failure('PREVIEW_REQUIRED');
   const result=await session.apply({config,credentials,signal:abort.signal,confirmedFingerprint:input.fingerprint,backupVerified:input.backupVerified===true});guard();
   inspection=result;step=transition(step,'APPLIED');return state();
  });},
  saveAndStart(input){return operation(async()=>{
   requireStep('auth');if(input?.authConfirmed!==true)throw failure('AUTH_CONFIGURATION_REQUIRED');
   if(!config||!credentials)throw failure('SESSION_EXPIRED');
   const value=config;await verifyKeys(value,{signal:abort.signal});guard();
   return start(value,true);
  });},
  startSaved(saved){return operation(()=>start(validateConfig(saved),false));},
  open(){return operation(async()=>{await navigate();return state();});},
  async quit(){
   closing=true;abort.abort();forget();
   await running?.stop();
   await Promise.allSettled([...pending]);
   await running?.stop();running=null;
  }
 };
}
