import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {runCli} from './supabase-cli.mjs';
test('transmits credentials via child environment, not arguments, and redacts errors',async()=>{
 const value=await runCli({cliPath:process.execPath,args:['-e','process.stdout.write(process.env.SUPABASE_ACCESS_TOKEN)'],
  cwd:process.cwd(),credentials:{accessToken:'canary-token',databasePassword:'canary-password'},spawnProcess:spawn});
 assert.equal(value,'canary-token');
 await assert.rejects(runCli({cliPath:process.execPath,args:['-e','process.stderr.write(process.env.SUPABASE_ACCESS_TOKEN);process.exit(1)'],
 cwd:process.cwd(),credentials:{accessToken:'canary-token',databasePassword:'canary-password'}}),e=>e.code==='CLI_FAILED'&&!e.message.includes('canary'));
});
test('terminates a hung owned CLI process within its deadline',async()=>{
 await assert.rejects(runCli({cliPath:process.execPath,args:['-e','setInterval(()=>{},1000)'],cwd:process.cwd(),credentials:{},timeoutMs:50}),e=>e.code==='CLI_TIMEOUT');
});
