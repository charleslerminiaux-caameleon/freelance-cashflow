import { afterEach, beforeEach, expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';
import { localDate } from '@fc/shared';
import { buildCashflowEvents } from '@fc/domain';
import { synchronizeQontoForOwner } from '../src/features/integrations/sync-qonto';
import { analyzeRecurring } from '../src/features/recurring-detection/service';
import { createAnalysisStore, getRecurringSuggestionWorkspace } from '../src/features/recurring-detection/repository';
import { confirmRecurringFromTransaction, getHistoryRecurringWorkspace } from '../src/features/recurring-detection/history-repository';
import { loadDashboardSourceData } from '../src/features/dashboard/query';
import { createRecurringCalendar, fixtureResponse } from './qonto-fixtures.mjs';

if (process.env.E2E_STACK_PROJECT !== 'jalon-2-qonto-tests' || process.env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:56321') throw new Error('Dedicated test database required');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, options);
const user = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, options);
const previousDispatcher = getGlobalDispatcher();
let http: MockAgent;
let owner: string;
let revision = 0;
let requests = 0;
let failure = '';
let foreignOwner: string | undefined;
let calendar: ReturnType<typeof createRecurringCalendar>;
let today: ReturnType<typeof localDate>;
let range: { startDate: ReturnType<typeof localDate>; endDate: ReturnType<typeof localDate> };
const workspace = () => getRecurringSuggestionWorkspace(user, owner);
const analyze = () => analyzeRecurring(owner, { store: createAnalysisStore(admin), runId: randomUUID, now: () => new Date() });
const sync = () => synchronizeQontoForOwner(owner);
async function projection() {
  const data = await loadDashboardSourceData(user, owner, range);
  return { data, events: buildCashflowEvents(data, range, data.paidMonthsByRecurringId) };
}
async function rows(table: string) {
  const result = await user.from(table).select('*').eq('owner_user_id', owner);
  if (result.error) throw new Error('Isolated acceptance read failed');
  return result.data;
}
async function checkWrite(result: PromiseLike<{ error: unknown }>) {
  if ((await result).error) throw new Error('Isolated acceptance write failed');
}
beforeEach(async () => {
  revision = 0; requests = 0; failure = ''; foreignOwner = undefined;
  calendar = createRecurringCalendar();
  today = localDate(calendar.today);
  const future = new Date(`${today}T12:00:00Z`); future.setUTCDate(future.getUTCDate() + 60);
  range = { startDate: today, endDate: localDate(future.toISOString().slice(0, 10)) };
  http = new MockAgent();
  http.disableNetConnect();
  http.enableNetConnect('127.0.0.1:56321');
  const { count, error } = await admin.from('app_settings').select('*', { count: 'exact', head: true });
  if (error || count !== 0) throw new Error('Refusing existing singleton owner');
  const password = randomBytes(24).toString('base64url');
  const email = 'dashboard-integration@example.test';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error('Isolated owner creation failed');
  owner = created.data.user.id;
  await checkWrite(admin.from('app_settings').insert({ owner_user_id: owner, timezone: calendar.timezone }));
  if ((await user.auth.signInWithPassword({ email, password })).error) throw new Error('Isolated owner login failed');
  http.get('https://thirdparty.qonto.com').intercept({ path: /^\/v2\/(bank_accounts|transactions)\?/, method: 'GET' }).reply(request => {
    requests += 1;
    const response = fixtureResponse(new URL(request.path, 'https://thirdparty.qonto.com'), { revision, failure, scenario: 'dashboard', calendar });
    return { statusCode: response.status, data: JSON.stringify(response.body), responseOptions: { headers: { 'content-type': 'application/json' } } };
  }).persist();
  setGlobalDispatcher(http);
  await expect(fetch('https://forbidden-acceptance.invalid')).rejects.toThrow();
});
afterEach(async () => {
  setGlobalDispatcher(previousDispatcher);
  await http.close();
  if (foreignOwner) await checkWrite(admin.auth.admin.deleteUser(foreignOwner));
  if (owner) await checkWrite(admin.auth.admin.deleteUser(owner));
});


async function history(transactionId?: string) {
  return getHistoryRecurringWorkspace(user, owner, transactionId ?? (await rows('bank_transactions'))[0]!.id);
}
function input(workspace: Awaited<ReturnType<typeof history>>) {
  return { transactionId: workspace.transactionId, sourcePublication: workspace.sourcePublication, command: {
    label: 'Synthetic history expense', amount_cents: 1500, day_of_month: workspace.dayOfMonth,
    start_date: localDate(workspace.nextDate), cashflow_kind: 'expense' as const, certainty: 'committed' as const, probability_basis_points: 10000,
  } };
}
async function stale() {
  await checkWrite(admin.from('integrations').update({ last_success_at: new Date(Date.now() - 25 * 3600000).toISOString(), last_auto_attempt_at: null }).eq('owner_user_id', owner));
}

test('one imported debit supports manual confirmation, nonempty future projection, edits, deletion suppression and deliberate recreation', async () => {
  expect(await sync()).toMatchObject({ success: true, analysisResult: { success: true, count: 0 } });
  expect(await rows('bank_transactions')).toHaveLength(1);
  expect((await workspace()).suggestions).toHaveLength(0);
  expect((await projection()).events).toHaveLength(0);
  const first = await history();
  const id = await confirmRecurringFromTransaction(user, owner, input(first));
  const projected = await projection();
  expect(projected.events.length).toBeGreaterThan(0);
  expect(projected.events.every(event => event.plannedDate > today && event.plannedDate.slice(0, 7) > today.slice(0, 7))).toBe(true);
  expect(projected.events.some(event => event.amountCents === 1500)).toBe(true);
  expect(await rows('recurring_suggestions')).toMatchObject([{ state: 'confirmed', creation_source: 'history', recurring_cashflow_id: id }]);
  await checkWrite(user.from('recurring_cashflows').update({ amount_cents: 1700 }).eq('id', id));
  expect((await sync()).success).toBe(true);
  expect(await rows('recurring_cashflows')).toMatchObject([{ id, amount_cents: 1700 }]);
  await checkWrite(user.from('recurring_cashflows').delete().eq('id', id));
  expect((await sync()).success).toBe(true);
  expect(await rows('recurring_cashflows')).toHaveLength(0);
  expect((await workspace()).suggestions).toHaveLength(0);
  const dismissed = await history();
  expect(dismissed.seriesState).toBe('dismissed');
  await expect(confirmRecurringFromTransaction(user, owner, input(dismissed))).rejects.toThrow();
  const recreated = await confirmRecurringFromTransaction(user, owner, { ...input(dismissed), allowRecreate: true });
  expect(recreated).not.toBe(id);
  expect(await rows('recurring_cashflows')).toHaveLength(1);
});

test('two authenticated concurrent history confirmations from distinct transactions share one series and expense', async () => {
  revision = 2;
  expect((await sync()).success).toBe(true);
  const transactions = await rows('bank_transactions');
  expect(transactions).toHaveLength(2);
  const forms = await Promise.all(transactions.map(row => history(row.id)));
  const ids = await Promise.all(forms.map(form => confirmRecurringFromTransaction(user, owner, input(form))));
  expect(ids[0]).toBe(ids[1]);
  expect(await rows('recurring_cashflows')).toHaveLength(1);
  expect(await rows('recurring_suggestions')).toHaveLength(1);
  expect((await projection()).events.length).toBeGreaterThan(0);
});

test('history association preserves fields and excludes paid month using observed amount; foreign owner is rejected', async () => {
  expect((await sync()).success).toBe(true);
  const form = await history();
  const id = randomUUID();
  await checkWrite(user.from('recurring_cashflows').insert({ id, owner_user_id: owner, direction: 'outflow', cashflow_kind: 'expense', label: 'Synthetic association', amount_cents: 1800, frequency: 'monthly', day_of_month: Number(today.slice(-2)), start_date: today, certainty: 'certain', probability_basis_points: 10000 }));
  const original = await rows('recurring_cashflows');
  await confirmRecurringFromTransaction(user, owner, { ...input(form), existingExpenseId: id });
  expect(await rows('recurring_cashflows')).toEqual(original);
  const events = (await projection()).events;
  expect(events.length).toBeGreaterThan(0);
  expect(events.some(event => event.plannedDate.slice(0, 7) === today.slice(0, 7))).toBe(false);
  revision = 1;
  expect((await sync()).success).toBe(true);
  expect((await projection()).events.some(event => event.plannedDate === today)).toBe(true);
  const password = randomBytes(24).toString('base64url');
  const created = await admin.auth.admin.createUser({ email: 'foreign-history@example.test', password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error('Isolated foreign owner unavailable');
  foreignOwner = created.data.user.id;
  const foreign = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, options);
  if ((await foreign.auth.signInWithPassword({ email: 'foreign-history@example.test', password })).error) throw new Error('Isolated foreign login failed');
  const denied = await foreign.rpc('confirm_recurring_from_transaction', { p_transaction_id: form.transactionId, p_source_publication: form.sourcePublication, p_command: input(form).command });
  expect(denied.error).not.toBeNull();
  expect(await rows('recurring_cashflows')).toEqual(original);
});

test('automatic admission counts zero provider requests for no import/fresh/cooldown and retains bank success when analysis fails', async () => {
  const automatic = () => synchronizeQontoForOwner(owner, { mode: 'automatic' });
  expect(await automatic()).toEqual({ success: true, skipped: true });
  expect(requests).toBe(0);
  expect((await sync()).success).toBe(true);
  const imported = requests;
  expect(imported).toBeGreaterThan(0);
  expect(await automatic()).toEqual({ success: true, skipped: true });
  expect(requests).toBe(imported);
  await stale();
  const run = randomUUID();
  await checkWrite(admin.rpc('acquire_recurring_analysis', { p_owner_user_id: owner, p_run_id: run }));
  expect(await automatic()).toMatchObject({ success: true, analysisResult: { success: false, code: 'DETECTION_LOCKED' } });
  expect(requests).toBeGreaterThan(imported);
  const published = (await rows('integrations'))[0]!.last_success_at;
  expect(Date.now() - Date.parse(published)).toBeLessThan(60000);
  expect((await projection()).data.banking!.fullTransactions).toHaveLength(1);
  await checkWrite(admin.rpc('fail_recurring_analysis', { p_owner_user_id: owner, p_run_id: run, p_error_code: 'DATABASE_ERROR' }));
  await stale(); failure = 'auth';
  expect(await automatic()).toMatchObject({ success: false, code: 'PROVIDER_AUTH_EXPIRED' });
  const afterFailure = requests;
  expect(await automatic()).toEqual({ success: true, skipped: true });
  expect(requests).toBe(afterFailure);
  expect((await projection()).data.banking!.fullTransactions).toHaveLength(1);
  expect((await analyze()).success).toBe(true);
});
