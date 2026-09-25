import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transition} from './wizard-state.mjs';
test('blocks applying or launching before inspection and confirmation',()=>{
 assert.throws(()=>transition('welcome','APPLY'),e=>e.code==='INVALID_STEP');
 assert.equal(transition('welcome','CONFIGURE'),'configuration');
 assert.equal(transition('configuration','INSPECTED'),'preview');
 assert.equal(transition('preview','APPLIED'),'auth');
 assert.equal(transition('auth','STARTED'),'ready');
});
