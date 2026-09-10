import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

// Deliberately fixed to the dedicated, disposable stack. Never accepts a production URL.
const container = 'supabase_db_jalon-2-qonto-tests';
class DatabaseConnection {
  constructor() {
    this.child = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres']);
    this.stdout = '';
    this.stderr = '';
    this.child.stdout.on('data', chunk => { this.stdout += chunk; });
    this.child.stderr.on('data', chunk => { this.stderr += chunk; });
    this.child.on('error', () => { this.exited = true; });
    this.child.on('exit', () => { this.exited = true; });
  }
  async query(sql) {
    assert.ok(!this.pending, 'only one outstanding query per actual connection');
    this.pending = true;
    const marker = `done_${randomUUID().replaceAll('-', '')}`;
    this.stdout = '';
    this.stderr = '';
    this.child.stdin.write(`${sql};\n\\echo ${marker}\n`);
    try {
      const deadline = Date.now() + 15000;
      while (!this.stdout.includes(marker)) {
        assert.ok(!this.exited && Date.now() < deadline, 'isolated database connection unavailable or timed out');
        await delay(10);
      }
      if (this.stderr.includes('ERROR:')) {
        // Expose only known codes, never arbitrary PostgreSQL details or query data.
        const code = ['SYNC_LOCKED', 'DATABASE_ERROR'].find(code => this.stderr.includes(code));
        throw new Error(code ?? 'Unexpected isolated database error');
      }
      return this.stdout.slice(0, this.stdout.indexOf(marker)).trim();
    } finally { this.pending = false; }
  }
  close() { this.child.stdin.end('\\q\n'); }
}

const connections = [new DatabaseConnection(), new DatabaseConnection(), new DatabaseConnection()];
const [control, first, second] = connections;
const owner = randomUUID();
const runIds = [randomUUID(), randomUUID()];
const replacement = randomUUID();
let createdOwner = false;
try {
  const pids = await Promise.all(connections.map(c => c.query('select pg_backend_pid()')));
  assert.equal(new Set(pids).size, 3, 'three distinct PostgreSQL backends');
  assert.equal(await control.query('select count(*) from public.app_settings'), '0', 'refuse any existing singleton owner');
  await control.query(`begin; insert into auth.users(id) values('${owner}'); insert into public.app_settings(owner_user_id) values('${owner}'); insert into public.integrations(owner_user_id,provider) values('${owner}','qonto'); commit`);
  createdOwner = true;
  await control.query(`begin; select id from public.integrations where owner_user_id='${owner}' for update`);
  const race = [first, second].map(async (connection, index) => {
    try {
      const result = await connection.query(`begin; select public.acquire_banking_sync('${owner}','${runIds[index]}')`);
      await connection.query('commit');
      return { status: 'success', runId: runIds[index], result: JSON.parse(result) };
    } catch (error) {
      await connection.query('rollback');
      return { status: 'error', code: error.message };
    }
  });
  // Both requests must be physically waiting at once before releasing the gate.
  let waiting = 0;
  const deadline = Date.now() + 10000;
  while (waiting !== 2 && Date.now() < deadline) {
    waiting = Number(await control.query(`select count(*) from pg_stat_activity where pid in (${pids[1]},${pids[2]}) and wait_event_type='Lock'`));
    if (waiting !== 2) await delay(10);
  }
  assert.equal(waiting, 2, 'both independent acquisitions overlap while blocked on the same integration');
  await control.query('commit');
  const results = await Promise.all(race);
  assert.equal(results.filter(r => r.status === 'success').length, 1, 'exactly one acquired');
  assert.equal(results.filter(r => r.code === 'SYNC_LOCKED').length, 1, 'exactly one locked out');
  const winner = results.find(r => r.status === 'success');
  assert.equal(await control.query(`select count(*) from public.sync_runs where owner_user_id='${owner}' and status='running'`), '1');
  assert.equal(await control.query(`select lease_run_id from public.integrations where owner_user_id='${owner}'`), winner.runId);
  await first.query(`select public.stage_banking_page('${owner}','${winner.runId}','accounts',null,1,null,'[]')`);
  await control.query(`update public.integrations set lease_expires_at=clock_timestamp()-interval '1 second' where owner_user_id='${owner}'`);
  await second.query(`select public.acquire_banking_sync('${owner}','${replacement}')`);
  for (const sql of [
    `select public.stage_banking_page('${owner}','${winner.runId}','accounts',null,1,null,'[]')`,
    `select public.publish_banking_sync('${owner}','${winner.runId}')`,
    `select public.renew_banking_sync('${owner}','${winner.runId}')`,
    `select public.fail_banking_sync('${owner}','${winner.runId}','DATABASE_ERROR',false)`,
  ]) await assert.rejects(first.query(sql), { message: 'SYNC_LOCKED' });
  assert.equal(await control.query(`select lease_run_id from public.integrations where owner_user_id='${owner}'`), replacement);
  assert.equal(await control.query(`select status from public.sync_runs where id='${winner.runId}'`), 'interrupted');
  assert.equal(await control.query(`select count(*) from public.banking_sync_pages where owner_user_id='${owner}'`), '0');
  assert.equal(await control.query(`select count(*) from public.bank_accounts where owner_user_id='${owner}'`), '0');
  await second.query(`select public.stage_banking_page('${owner}','${replacement}','accounts',null,1,null,'[]'); select public.publish_banking_sync('${owner}','${replacement}')`);
  assert.equal(await control.query(`select status from public.sync_runs where id='${replacement}'`), 'succeeded');
  assert.equal(await control.query(`select count(*) from public.integrations where owner_user_id='${owner}' and lease_run_id is null and last_published_updated_to is not null`), '1');
  // Expiration must be checked after obtaining the row lock, never at transaction start.
  const blockedRun = randomUUID();
  await second.query(`select public.acquire_banking_sync('${owner}','${blockedRun}')`);
  await control.query(`begin; select id from public.integrations where owner_user_id='${owner}' for update`);
  const renewal = first.query(`select public.renew_banking_sync('${owner}','${blockedRun}')`).then(
    () => 'unexpected success', error => error.message,
  );
  let renewalWaiting = false;
  const renewalDeadline = Date.now() + 10000;
  while (!renewalWaiting && Date.now() < renewalDeadline) {
    renewalWaiting = await control.query(`select count(*) from pg_stat_activity where pid=${pids[1]} and wait_event_type='Lock'`) === '1';
    if (!renewalWaiting) await delay(10);
  }
  assert.ok(renewalWaiting, 'renewal is physically blocked on integration row');
  await control.query(`update public.integrations set lease_expires_at=clock_timestamp()-interval '1 second' where owner_user_id='${owner}'; commit`);
  assert.equal(await renewal, 'SYNC_LOCKED', 'expiry rechecked after waiting for lock');
  assert.equal(await control.query(`select count(*) from public.integrations where owner_user_id='${owner}' and lease_expires_at<clock_timestamp()`), '1', 'rejected renewal leaves expired lease unchanged');
  console.log('PASS: distinct connections, simultaneous acquisitions, one winner, fenced replacement, verified publication, expiry checked after lock wait.');
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  await control.query('rollback').catch(() => {});
  if (createdOwner) {
    await control.query(`delete from auth.users where id='${owner}'`).catch(() => { process.exitCode = 1; });
  }
  for (const connection of connections) connection.close();
}
