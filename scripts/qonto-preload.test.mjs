import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const preload = fileURLToPath(new URL('../apps/web/e2e/qonto-preload.cjs', import.meta.url));
test('Node fetch reaches synthetic fixed-origin HTTP and rejects unmocked Qonto/external requests', () => {
  const code = `
    const assert = require('node:assert/strict');
    (async () => {
      await require(process.argv[1]).ready;
      assert.equal(process.env.QONTO_TEST_INTERCEPTION_READY, '1');
      const response = await fetch('https://thirdparty.qonto.com/v2/bank_accounts?page=1&per_page=100');
      assert.equal((await response.json()).bank_accounts[0].balance_cents, 300000);
      for (const url of ['https://thirdparty.qonto.com/unmocked', 'https://unmocked-qonto-acceptance.invalid']) {
        await assert.rejects(fetch(url));
      }
    })().catch(() => { process.exitCode = 1; });`;
  const result = spawnSync(process.execPath, ['--require', preload, '-e', code, preload], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(result.status, 0, 'test-only HTTP dispatcher must intercept and fail closed');
});
