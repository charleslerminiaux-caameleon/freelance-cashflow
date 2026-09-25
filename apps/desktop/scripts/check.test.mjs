import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('desktop scripts are valid JavaScript',()=>{assert.equal(spawnSync(process.execPath,['scripts/check.mjs'],{cwd: new URL('..',import.meta.url)}).status,0);});
