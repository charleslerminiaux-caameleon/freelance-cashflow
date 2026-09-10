import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkClientBoundary } from './check-client-boundary.mjs';
test('scans nested client assets and fails on credential canaries or server modules', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qonto-bundle-'));
  try {
    await mkdir(join(root, 'chunks'));
    await writeFile(join(root, 'chunks/app.js'), 'safe client code');
    await checkClientBoundary(root, ['fake-runtime-canary']);
    for (const content of ['fake-runtime-canary', 'QONTO_SECRET_KEY', 'thirdparty.qonto.com', 'acquire_banking_sync']) {
      await writeFile(join(root, 'chunks/app.js'), content);
      await assert.rejects(checkClientBoundary(root, ['fake-runtime-canary']), /boundary/);
    }
  } finally { await rm(root, { force: true, recursive: true }); }
});
