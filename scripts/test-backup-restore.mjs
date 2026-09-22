import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { assertDedicatedConfig, cli, parseStatus, stack } from './run-isolated-tests.mjs';

const container = 'supabase_db_jalon-2-qonto-tests';
const destination = 'libra_restore_probe';
export function validateRestoreTarget(source, target) {
  if (source !== container || target !== destination) throw new Error('Refusing non-dedicated restoration target');
}
function docker(args, input) {
  const result = spawnSync('docker', args, { input, maxBuffer: 64 * 1024 * 1024, timeout: 90_000 });
  if (result.status !== 0) throw new Error('Dedicated restore command failed');
  return result.stdout;
}
function sql(database, query) {
  validateRestoreTarget(container, destination);
  if (!['postgres', destination].includes(database)) throw new Error('Refusing database');
  return docker(['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database], query).toString().trim();
}

export async function main() {
  validateRestoreTarget(container, destination);
  assertDedicatedConfig(await readFile(join(stack, 'supabase/config.toml'), 'utf8'));
  const environment = parseStatus(cli(['status', '--output', 'env']));
  assert.equal(sql('postgres', 'select count(*) from auth.users'), '0', 'Refusing existing users in source');
  assert.equal(sql('postgres', 'select count(*) from public.app_settings'), '0', 'Refusing existing owner');
  assert.equal(sql('postgres', `select count(*) from pg_database where datname='${destination}'`), '0', 'Refusing existing destination');
  const directory = await mkdtemp(join(tmpdir(), 'libra-restore-test-'));
  const authContainer = `libra-restore-auth-${randomUUID()}`;
  const password = randomBytes(24).toString('base64url');
  let owner;
  let databaseCreated = false;
  let authCreated = false;
  let stage = 'create synthetic owner';
  const headers = { apikey: environment.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
  try {
    const response = await fetch('http://127.0.0.1:56321/auth/v1/admin/users', { method: 'POST', headers,
      body: JSON.stringify({ email: 'restore@example.test', password, email_confirm: true }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('Synthetic owner unavailable');
    owner = (await response.json()).id;
    assert.match(owner, /^[a-f0-9-]{36}$/);
    sql('postgres', `insert into public.app_settings(owner_user_id,manual_current_balance_cents,safety_cash_threshold_cents) values('${owner}',125000,10000);
      insert into public.customers(id,owner_user_id,name) values('20000000-0000-4000-8000-000000000001','${owner}','Restore fixture');
      insert into public.invoices(owner_user_id,customer_id,invoice_number,issued_at,due_at,expected_payment_date,amount_ht_cents,vat_cents,amount_ttc_cents,status)
        values('${owner}','20000000-0000-4000-8000-000000000001','RESTORE-1',current_date,current_date+7,current_date+7,10000,2000,12000,'issued');`);
    stage = 'export and restore separate database';
    const archive = docker(['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '-Fc', '--schema=public', '--schema=auth', '--schema=supabase_migrations']);
    assert.ok(archive.length > 1000);
    sql('postgres', `create database ${destination} template template0`);
    databaseCreated = true;
    sql(destination, 'drop schema public; create schema extensions; create extension pgcrypto with schema extensions;');
    docker(['exec', '-i', container, 'pg_restore', '--exit-on-error', '-U', 'supabase_admin', '-d', destination], archive);
    stage = 'verify restored data and authorization';
    assert.equal(sql(destination, `select count(*) from auth.users where id='${owner}' and email='restore@example.test'`), '1');
    assert.equal(sql(destination, `select count(*) from auth.identities where user_id='${owner}' and provider='email'`), '1');
    assert.equal(sql(destination, `select manual_current_balance_cents from public.app_settings where owner_user_id='${owner}'`), '125000');
    assert.equal(sql(destination, `select i.amount_ttc_cents from public.invoices i join public.customers c on c.id=i.customer_id and c.owner_user_id=i.owner_user_id where i.owner_user_id='${owner}'`), '12000');
    assert.equal(sql(destination, `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${owner}',true); select sum(amount_ttc_cents) from public.invoices; rollback;`).split('\n').at(-1), '12000');
    assert.equal(sql(destination, `begin; set local role authenticated; select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',true); select count(*) from public.invoices; rollback;`).split('\n').at(-1), '0');
    assert.equal(sql(destination, 'select count(*)>0 from supabase_migrations.schema_migrations'), 't');
    stage = 'start isolated Auth against restored database';
    // Only the dedicated test Auth container is inspected. Its temporary secrets
    // stay in memory / a private temporary env file and never reach output.
    const config = JSON.parse(docker(['inspect', 'supabase_auth_jalon-2-qonto-tests']).toString())[0].Config;
    const authEnv = Object.fromEntries(config.Env.filter(value => value.startsWith('GOTRUE_') || value.startsWith('API_EXTERNAL_URL=')).map(value => {
      const split = value.indexOf('='); return [value.slice(0, split), value.slice(split + 1)];
    }));
    const databaseUrl = new URL(authEnv.GOTRUE_DB_DATABASE_URL);
    databaseUrl.hostname = container; databaseUrl.pathname = `/${destination}`;
    authEnv.GOTRUE_DB_DATABASE_URL = databaseUrl.href;
    authEnv.GOTRUE_SITE_URL = 'http://127.0.0.1:3200';
    const envPath = join(directory, 'auth.env');
    await writeFile(envPath, Object.entries(authEnv).map(([key, value]) => `${key}=${value}`).join('\n'), { mode: 0o600 });
    // Create then start: ownership is known even when starting fails.
    docker(['create', '--name', authContainer, '--network', 'supabase_network_jalon-2-qonto-tests', '-p', '127.0.0.1::9999', '--env-file', envPath, config.Image]);
    authCreated = true;
    docker(['start', authContainer]);
    const mapping = docker(['port', authContainer, '9999/tcp']).toString().trim();
    assert.match(mapping, /^127\.0\.0\.1:\d+$/);
    const base = `http://${mapping}`;
    let healthy = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { if ((await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) })).ok) { healthy = true; break; } } catch { /* still starting */ }
      await delay(500);
    }
    assert.ok(healthy, 'Restored Auth did not become healthy');
    stage = 'sign in to restored Auth';
    const login = await fetch(`${base}/token?grant_type=password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'restore@example.test', password }), signal: AbortSignal.timeout(10_000) });
    assert.equal(login.status, 200, 'Restored login failed');
    assert.equal((await login.json()).user.id, owner, 'Restored identity changed');
    console.log('PASS: separate database restoration preserves Auth login, owner, invoice/customer relation, amounts, migration history and owner/foreign-user RLS.');
  } catch {
    throw new Error(`Isolated restoration failed at: ${stage}`);
  } finally {
    let clean = true;
    if (authCreated) { try { docker(['rm', '-f', authContainer]); } catch { clean = false; } }
    if (databaseCreated) { try { sql('postgres', `drop database ${destination} with (force)`); } catch { clean = false; } }
    if (owner) {
      try { const response = await fetch(`http://127.0.0.1:56321/auth/v1/admin/users/${owner}`, { method: 'DELETE', headers, signal: AbortSignal.timeout(10_000) }); if (!response.ok) clean = false; }
      catch { clean = false; }
    }
    await rm(directory, { recursive: true, force: true });
    if (!clean) throw new Error('Isolated restoration cleanup incomplete');
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
