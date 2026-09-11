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
        const code = ['DETECTION_LOCKED', 'DETECTION_STALE', 'DETECTION_INVALID', 'DETECTION_DUPLICATE', 'DETECTION_NOT_FOUND'].find(code => this.stderr.includes(code));
        throw new Error(code ?? 'Unexpected isolated database error');
      }
      return this.stdout.slice(0, this.stdout.indexOf(marker)).trim();
    } finally { this.pending = false; }
  }
  close() { this.child.stdin.end('\\q\n'); }
}

const connections = [new DatabaseConnection(), new DatabaseConnection(), new DatabaseConnection()];
const [control, first, second] = connections;
const owner = randomUUID(), integration = randomUUID(), account = randomUUID();
const transactions = [randomUUID(), randomUUID(), randomUUID()];
const source = '2026-09-11T10:00:00.123456Z';
const candidate = `jsonb_build_array(jsonb_build_object('account_id','${account}','currency','EUR','normalized_label','synthetic concurrency','label','Synthetic concurrency','amount_cents',1000,'day_of_month',1,'last_payment_date',date_trunc('month',clock_timestamp() at time zone 'Europe/Paris')::date,'next_date',(date_trunc('month',clock_timestamp() at time zone 'Europe/Paris')+interval '1 month')::date,'transaction_ids',jsonb_build_array('${transactions[0]}','${transactions[1]}','${transactions[2]}')))`;
const command = `jsonb_build_object('label','Synthetic concurrency','amount_cents',1000,'day_of_month',1,'start_date',(date_trunc('month',clock_timestamp() at time zone 'Europe/Paris')+interval '1 month')::date,'category_id',null,'cashflow_kind','expense','certainty','certain','probability_basis_points',10000)`;
let createdOwner = false;
let pids;
async function waitForLocks(indices) {
  const deadline = Date.now() + 10000;
  let count = 0;
  while (Date.now() < deadline) {
    count = Number(await control.query(`select count(*) from pg_stat_activity where pid in (${indices.map(i => pids[i]).join(',')}) and wait_event_type='Lock'`));
    if (count === indices.length) return;
    await delay(10);
  }
  assert.fail('expected independent backends physically blocked on lock');
}
async function analyze(connection = control) {
  const run = randomUUID();
  await connection.query(`select public.acquire_recurring_analysis('${owner}','${run}'); select public.publish_recurring_analysis('${owner}','${run}','${source}',${candidate})`);
}
const confirm = (suggestion, existing = null) => `select public.confirm_recurring_suggestion('${suggestion}','${source}',${command},${existing ? `'${existing}'` : 'null'},false)`;
try {
  pids = await Promise.all(connections.map(c => c.query('select pg_backend_pid()')));
  assert.equal(new Set(pids).size, 3, 'three distinct PostgreSQL backends');
  assert.equal(await control.query('select count(*) from public.app_settings'), '0', 'refuse any existing singleton owner');
  await control.query(`begin; insert into auth.users(id) values('${owner}'); insert into public.app_settings(owner_user_id) values('${owner}'); insert into public.integrations(id,owner_user_id,provider,last_success_at) values('${integration}','${owner}','qonto','${source}');
    insert into public.bank_accounts(id,owner_user_id,integration_id,external_id,name,currency,current_balance_cents,status,updated_at) values('${account}','${owner}','${integration}','synthetic','Synthetic account','EUR',0,'active',now());
    ${transactions.map((id, i) => `insert into public.bank_transactions(id,owner_user_id,integration_id,bank_account_id,external_id,currency,amount_cents,direction,status,label,transaction_date,updated_at) values('${id}','${owner}','${integration}','${account}','synthetic-${i}','EUR',1000,'outflow','completed','Synthetic concurrency',(date_trunc('month',clock_timestamp() at time zone 'Europe/Paris')-interval '${i} month')::date,now());`).join('\n')} commit`);
  createdOwner = true;
  for (const c of connections) await c.query(`select set_config('request.jwt.claim.sub','${owner}',false); set statement_timeout='12s'`);
  // Two analyses contend for the exact same integration row.
  await control.query(`begin; select id from public.integrations where id='${integration}' for update`);
  const runs = [randomUUID(), randomUUID()];
  const acquisitions = [first, second].map(async (c, i) => {
    try { await c.query(`select public.acquire_recurring_analysis('${owner}','${runs[i]}')`); return runs[i]; }
    catch (error) { return error.message; }
  });
  await waitForLocks([1, 2]);
  await control.query('commit');
  const acquired = await Promise.all(acquisitions);
  assert.equal(acquired.filter(x => x === 'DETECTION_LOCKED').length, 1, 'one analysis lock loser');
  const run = acquired.find(x => x !== 'DETECTION_LOCKED');
  await control.query(`select public.publish_recurring_analysis('${owner}','${run}','${source}',${candidate})`);
  const suggestion = await control.query(`select id from public.recurring_suggestions where owner_user_id='${owner}'`);

  // Both clicks wait before either can insert; exactly one financial row results.
  await first.query('set role authenticated');
  await second.query('set role authenticated');
  await control.query(`begin; select id from public.integrations where id='${integration}' for update`);
  const clicks = [first.query(confirm(suggestion)), second.query(confirm(suggestion))];
  await waitForLocks([1, 2]);
  await control.query('commit');
  const confirmed = await Promise.all(clicks);
  assert.equal(confirmed[0], confirmed[1], 'double confirm returns identical linked id');
  assert.equal(await control.query(`select count(*) from public.recurring_cashflows where owner_user_id='${owner}'`), '1');
  await first.query(`delete from public.recurring_cashflows where id='${confirmed[0]}'`);
  await control.query(`select public.set_recurring_suggestion_state('${suggestion}','reexamine')`);
  await analyze();

  // Reproduce the dangerous inversion: DELETE waits while confirmation owns integration.
  // The same confirmation transaction must still be able to lock the expense row.
  const manual = randomUUID();
  await control.query(`insert into public.recurring_cashflows(id,owner_user_id,direction,cashflow_kind,label,amount_cents,frequency,day_of_month,start_date) values('${manual}','${owner}','outflow','expense','Synthetic concurrency',1000,'monthly',1,current_date)`);
  await control.query(`begin; select id from public.integrations where id='${integration}' for update`);
  const deletion = first.query(`delete from public.recurring_cashflows where id='${manual}'`);
  await waitForLocks([1]);
  assert.equal(await control.query(confirm(suggestion, manual)), manual, 'association can lock charge while DELETE waits at statement prelock');
  await control.query('commit');
  await deletion;
  assert.equal(await control.query(`select state||':'||(recurring_cashflow_id is null)::text from public.recurring_suggestions where id='${suggestion}'`), 'dismissed:true', 'concurrent delete suppresses just-associated series');
  await assert.rejects(second.query(confirm(suggestion)), { message: 'DETECTION_STALE' });

  // Publication and deletion overlap; publication cannot resurrect a deleted charge.
  await control.query(`select public.set_recurring_suggestion_state('${suggestion}','reexamine')`);
  await analyze();
  const linked = await first.query(confirm(suggestion));
  const publishRun = randomUUID();
  await control.query(`select public.acquire_recurring_analysis('${owner}','${publishRun}'); begin; select id from public.integrations where id='${integration}' for update`);
  const deleting = first.query(`delete from public.recurring_cashflows where id='${linked}'`);
  await second.query('reset role');
  const publishing = second.query(`select public.publish_recurring_analysis('${owner}','${publishRun}','${source}',${candidate})`);
  await waitForLocks([1, 2]);
  await control.query('commit');
  await Promise.all([deleting, publishing]);
  assert.equal(await control.query(`select state||':'||(recurring_cashflow_id is null)::text from public.recurring_suggestions where id='${suggestion}'`), 'dismissed:true');
  assert.equal(await control.query(`select count(*) from public.recurring_cashflows where owner_user_id='${owner}'`), '0');

  // A lease expiring while blocked is checked using database wall time after the lock.
  const expiring = randomUUID();
  await control.query(`select public.acquire_recurring_analysis('${owner}','${expiring}'); begin; select id from public.integrations where id='${integration}' for update`);
  const blocked = second.query(`select public.publish_recurring_analysis('${owner}','${expiring}','${source}',${candidate})`).then(() => 'unexpected success', e => e.message);
  await waitForLocks([2]);
  await control.query(`update public.recurring_detection_runs set lease_expires_at=clock_timestamp()-interval '1 second' where owner_user_id='${owner}'; commit`);
  assert.equal(await blocked, 'DETECTION_LOCKED');
  const replacement = randomUUID();
  await control.query(`select public.acquire_recurring_analysis('${owner}','${replacement}')`);
  await assert.rejects(second.query(`select public.fail_recurring_analysis('${owner}','${expiring}','DETECTION_INVALID')`), { message: 'DETECTION_LOCKED' });
  assert.equal(await control.query(`select lease_run_id from public.recurring_detection_runs where owner_user_id='${owner}'`), replacement);
  console.log('PASS: three backends; analysis contention; double confirmation; DELETE prelock vs association; publication vs deletion; expiry after lock wait; fenced replacement.');
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  await control.query('rollback').catch(() => {});
  // Always release blockers before cleanup if an assertion failed mid-race.
  await Promise.all([first, second].map(c => c.pending ? Promise.resolve() : c.query('rollback; reset role').catch(() => {})));
  if (createdOwner) await control.query(`delete from auth.users where id='${owner}'`).catch(() => { process.exitCode = 1; });
  for (const c of connections) c.close();
}
