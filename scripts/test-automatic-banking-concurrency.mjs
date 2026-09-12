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
const runs = [randomUUID(), randomUUID()];
let createdOwner = false;
async function waitForLocks(pids, count) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (Number(await control.query(`select count(*) from pg_stat_activity where pid in (${pids.join(',')}) and wait_event_type='Lock'`)) === count) return;
    await delay(10);
  }
  assert.fail('independent requests did not overlap at the integration lock');
}
try {
  const pids = await Promise.all(connections.map(c => c.query('select pg_backend_pid()')));
  assert.equal(new Set(pids).size, 3);
  assert.equal(await control.query('select count(*) from public.app_settings'), '0', 'refuse any existing singleton owner');
  await control.query(`begin; insert into auth.users(id) values('${owner}'); insert into public.app_settings(owner_user_id) values('${owner}'); insert into public.integrations(owner_user_id,provider,last_success_at) values('${owner}','qonto',clock_timestamp()-interval '25 hours'); commit`);
  createdOwner = true;
  await control.query(`begin; select id from public.integrations where owner_user_id='${owner}' for update`);
  const race = [first, second].map((c, i) => c.query(`select coalesce(public.acquire_automatic_banking_sync('${owner}','${runs[i]}')::text,'SKIPPED')`));
  await waitForLocks(pids.slice(1), 2);
  await control.query('commit');
  const results = await Promise.all(race);
  assert.equal(results.filter(r => r !== 'SKIPPED').length, 1, 'exactly one automatic admission');
  assert.equal(results.filter(r => r === 'SKIPPED').length, 1, 'one neutral skip');
  assert.equal(await control.query(`select count(*) from public.sync_runs where owner_user_id='${owner}'`), '1');
  const winner = JSON.parse(results.find(r => r !== 'SKIPPED')).run_id;
  // A contender is physically queued while the winner publishes. Remove cooldown
  // in this fixture so fresh-publication rechecking is independently necessary.
  await first.query(`begin; select id from public.integrations where owner_user_id='${owner}' for update; update public.integrations set last_auto_attempt_at=null where owner_user_id='${owner}'`);
  const queued = second.query(`select coalesce(public.acquire_automatic_banking_sync('${owner}','${randomUUID()}')::text,'SKIPPED')`);
  await waitForLocks([pids[2]], 1);
  await first.query(`select public.stage_banking_page('${owner}','${winner}','accounts',null,1,null,'[]'); select public.publish_banking_sync('${owner}','${winner}'); commit`);
  assert.equal(await queued, 'SKIPPED', 'queued contender rechecks winner publication');
  assert.equal(await control.query(`select count(*) from public.sync_runs where owner_user_id='${owner}'`), '1', 'no sequential second run');
  assert.equal(await control.query(`select status from public.sync_runs where id='${winner}'`), 'succeeded');
  assert.equal(await control.query(`select count(*) from public.integrations where owner_user_id='${owner}' and lease_run_id is null and last_success_at>clock_timestamp()-interval '1 minute'`), '1');
  console.log('PASS: automatic contention across three backends, one winner, neutral loser, queued contender after actual publication skips, exactly one run.');
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  await Promise.all(connections.map(c => c.query('rollback').catch(() => {})));
  if (createdOwner) await control.query(`delete from auth.users where id='${owner}'`).catch(() => { process.exitCode = 1; });
  for (const connection of connections) connection.close();
}
