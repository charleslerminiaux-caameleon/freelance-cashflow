import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessUpgrade} from './upgrade.mjs';
test('requires setup when the packaged schema changes and blocks unknown or newer remote schema',()=>{
 assert.equal(assessUpgrade({savedSchemaHash:'a',packagedSchemaHash:'a'}).canStart,true);
 assert.equal(assessUpgrade({savedSchemaHash:'a',packagedSchemaHash:'b'}).canStart,false);
 assert.equal(assessUpgrade({savedSchemaHash:'a',packagedSchemaHash:'a',inspection:{kind:'incompatible'}}).canStart,false);
});
