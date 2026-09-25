import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicDiagnostic} from './diagnostic.mjs';
test('whitelists public diagnostic fields instead of scrubbing secrets afterwards',()=>{
 assert.deepEqual(publicDiagnostic({version:'1.0',platform:'darwin',step:'auth',running:false,secret:'canary',error:Error('private')}),
 {version:'1.0',platform:'darwin',step:'auth',running:false});
});
