import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMigrationSession} from './migration-session.mjs';
test('requires a current preview and refuses changed remote state',async()=>{
 let fingerprint='first';let mutations=0;
 const session=createMigrationSession({inspect:async()=>({kind:'empty',fingerprint,pending:[{filename:'001_core.sql'}]}),
  run:async args=>{if(args.includes('--yes'))mutations++;},prepare:async()=>({cwd:'/unused',dispose:async()=>{}})});
 const input={config:{projectRef:'ref'},credentials:{}};
 const preview=await session.preview(input);fingerprint='changed';
 await assert.rejects(session.apply({...input,confirmedFingerprint:preview.fingerprint}),e=>e.code==='DATABASE_CHANGED');
 assert.equal(mutations,0);
});
test('requires a backup for existing data and re-inspects after interruption',async()=>{
 let fingerprint='first',kind='pending';let mutations=0;
 const session=createMigrationSession({inspect:async()=>({kind,fingerprint,pending:[{filename:'001.sql'}]}),
  run:async args=>{if(args.includes('--yes')){mutations++;throw Error('interrupted');}},prepare:async()=>({cwd:'/unused',dispose:async()=>{}})});
 const input={config:{projectRef:'ref'},credentials:{}};await session.preview(input);
 await assert.rejects(session.apply({...input,confirmedFingerprint:fingerprint}),e=>e.code==='BACKUP_REQUIRED');
 await assert.rejects(session.apply({...input,confirmedFingerprint:fingerprint,backupVerified:true}));
 await assert.rejects(session.apply({...input,confirmedFingerprint:fingerprint,backupVerified:true}),e=>e.code==='PREVIEW_REQUIRED');
 assert.equal(mutations,1);
});
