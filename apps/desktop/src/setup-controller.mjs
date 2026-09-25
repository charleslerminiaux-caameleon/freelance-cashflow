import {validateConfig} from './config.mjs';
import {failure} from './errors.mjs';
import {transition} from './wizard-state.mjs';
export function createSetupController({schemaHash,store,verifyKeys,session,launch,open}) {
 let step='welcome',config,credentials,inspection,running=null,expiry;
 function forget(){config=undefined;credentials=undefined;clearTimeout(expiry);session.clear();}
 function requireStep(expected){if(step!==expected)throw failure('INVALID_STEP');}
 function state(){return {step,running:Boolean(running),projectRef:config?.projectRef,
  inspection:inspection?{kind:inspection.kind,fingerprint:inspection.fingerprint,pending:inspection.pending.map(m=>m.filename)}:null};}
 return {
  getState:state,
  async inspect(input) {
   if(running)throw failure('ALREADY_RUNNING');
   if(!input||!['new','existing'].includes(input.mode)||typeof input.accessToken!=='string'||!input.accessToken.trim()||
    input.accessToken.length>8192||typeof input.databasePassword!=='string'||input.databasePassword.length>8192)throw failure('INVALID_CONFIGURATION');
   forget();inspection=undefined;step='configuration';config=validateConfig(input);
   credentials={accessToken:input.accessToken.trim(),databasePassword:input.databasePassword};
   expiry=setTimeout(()=>{forget();inspection=undefined;if(step!=='ready')step='configuration';},15*60*1000);expiry.unref?.();
   await verifyKeys(config);
   const result=await session.preview({config,credentials});
   if(input.mode==='new'&&result.kind!=='empty')throw failure('PROJECT_NOT_EMPTY');
   if(input.mode==='existing'&&result.kind==='empty')throw failure('EMPTY_DATABASE');
   inspection=result;step=transition(step,'INSPECTED');return state();
  },
  async apply(input) {
   requireStep('preview');if(!config||!credentials)throw failure('SESSION_EXPIRED');
   if(input?.fingerprint!==inspection.fingerprint)throw failure('PREVIEW_REQUIRED');
   const result=await session.apply({config,credentials,confirmedFingerprint:input.fingerprint,backupVerified:input.backupVerified===true});
   inspection=result;step=transition(step,'APPLIED');return state();
  },
  async saveAndStart(input) {
   requireStep('auth');if(input?.authConfirmed!==true)throw failure('AUTH_CONFIGURATION_REQUIRED');
   if(!config||!credentials)throw failure('SESSION_EXPIRED');
   await verifyKeys(config);
   const candidate=await launch(config);
   try {await store.write({...config,schemaHash});}catch(error){await candidate.stop();throw error;}
   running=candidate;step=transition(step,'STARTED');forget();await open(running.origin);return state();
  },
  async startSaved(saved){running=await launch(validateConfig(saved));step='ready';await open(running.origin);return state();},
  async open(){if(running)await open(running.origin);return state();},
  async quit(){forget();if(running)await running.stop();running=null;}
 };
}
