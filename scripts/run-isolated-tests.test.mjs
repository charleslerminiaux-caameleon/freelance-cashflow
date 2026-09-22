import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareStack, assertDedicatedConfig, parseStatus, testEnvironment } from './run-isolated-tests.mjs';

test('derives an isolated stack without copying env or changing source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qonto-harness-'));
  try {
    await mkdir(join(root, 'supabase/migrations'), { recursive: true });
    await mkdir(join(root, 'supabase/tests'));
    const config = 'project_id = "source"\n[api]\nport = 55321\n[db]\nport = 55322\nshadow_port = 55320\n';
    await writeFile(join(root, 'supabase/config.toml'), config);
    await writeFile(join(root, 'supabase/seed.sql'), '-- fixture');
    await writeFile(join(root, 'supabase/.env'), 'DO_NOT_COPY=canary');
    const destination = join(root, '.isolated-tests');
    await mkdir(destination);
    await writeFile(join(destination, 'sentinel'), 'unowned');
    await assert.rejects(prepareStack(root, destination), /dedicated/);
    assert.equal(await readFile(join(destination, 'sentinel'), 'utf8'), 'unowned');
    await rm(destination, { recursive: true });
    await prepareStack(root, destination);
    assert.equal(await readFile(join(root, 'supabase/config.toml'), 'utf8'), config);
    assertDedicatedConfig(await readFile(join(destination, 'supabase/config.toml'), 'utf8'));
    await assert.rejects(readFile(join(destination, 'supabase/.env')));
    await writeFile(join(destination, 'supabase/config.toml'), config);
    await assert.rejects(prepareStack(root, destination), /dedicated/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('refuses foreign projects and local or remote endpoints outside dedicated stack', () => {
  assert.throws(() => assertDedicatedConfig('project_id = "other"\n[api]\nport = 56321\n[db]\nport = 56322'), /dedicated/);
  for (const url of ['https://example.com', 'http://127.0.0.1:55321', 'http://127.0.0.1:56321/path']) {
    assert.throws(() => parseStatus(`API_URL="${url}"\nANON_KEY="fake"\nSERVICE_ROLE_KEY="fake"`), /dedicated/);
  }
  const parsed = parseStatus('API_URL="http://127.0.0.1:56321"\nANON_KEY="fake"\nSERVICE_ROLE_KEY="fake2"');
  assert.equal(parsed.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:56321');
  const env = testEnvironment({ QONTO_LOGIN: 'inherited', QONTO_SECRET_KEY: 'inherited', NODE_OPTIONS: 'unsafe', FORCE_COLOR: '1' });
  assert.notEqual(env.QONTO_LOGIN, 'inherited');
  assert.notEqual(env.QONTO_SECRET_KEY, 'inherited');
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.FORCE_COLOR, undefined);
});

test('all acceptance entry points include recurring concurrency and browser lifecycle', async () => {
  const harness = await import('./run-isolated-tests.mjs');
  assert.ok(harness.databaseProbes?.includes('scripts/test-recurring-concurrency.mjs'), 'recurring contention must run in db/all');
  assert.ok(harness.browserSpecs?.includes('recurring-detection.spec.ts'), 'recurring browser lifecycle must run in e2e/all');
});

test('dashboard workflows run through both isolated acceptance suites', async () => {
  const harness = await import('./run-isolated-tests.mjs');
  assert.ok(harness.browserSpecs.includes('dashboard-workflows.spec.ts'));
  assert.ok((await readFile(new URL('../apps/web/e2e/integration.config.ts', import.meta.url), 'utf8')).includes('e2e/dashboard-workflows.integration.ts'));
});

test('direct provider credentials cannot leak from installation environment into acceptance runs', () => {
  const names = ['PENNYLANE_API_TOKEN','REVOLUT_CLIENT_ID','REVOLUT_REFRESH_TOKEN','REVOLUT_PRIVATE_KEY','REVOLUT_ISSUER','BUNQ_API_KEY','BUNQ_CONTEXT_PATH'];
  const env = testEnvironment(Object.fromEntries(names.map(name => [name, 'inherited-private-value'])));
  for (const name of names) assert.equal(env[name], '');
});
