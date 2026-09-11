import { afterEach, beforeEach, expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';
import { localDate } from '@fc/shared';
import { buildCashflowEvents } from '@fc/domain';
import { synchronizeQontoForOwner } from '../src/features/integrations/sync-qonto';
import { analyzeRecurring } from '../src/features/recurring-detection/service';
import { createAnalysisStore, confirmSuggestion, getRecurringSuggestionWorkspace, setSuggestionState } from '../src/features/recurring-detection/repository';
import { loadDashboardSourceData } from '../src/features/dashboard/query';
import { fixtureResponse } from './qonto-fixtures.mjs';

if (process.env.E2E_STACK_PROJECT !== 'jalon-2-qonto-tests' || process.env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:56321') throw new Error('Dedicated test database required');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, options);
const user = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, options);
const previousDispatcher = getGlobalDispatcher();
let http: MockAgent;
let owner: string;
let revision = 0;
const today = localDate(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date()));
const future = new Date(`${today}T12:00:00Z`); future.setUTCDate(future.getUTCDate() + 60);
const range = { startDate: today, endDate: localDate(future.toISOString().slice(0, 10)) };
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
  revision = 0;
  http = new MockAgent();
  http.disableNetConnect();
  http.enableNetConnect('127.0.0.1:56321');
  const { count, error } = await admin.from('app_settings').select('*', { count: 'exact', head: true });
  if (error || count !== 0) throw new Error('Refusing existing singleton owner');
  const password = randomBytes(24).toString('base64url');
  const email = 'recurring-integration@example.test';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error('Isolated owner creation failed');
  owner = created.data.user.id;
  await checkWrite(admin.from('app_settings').insert({ owner_user_id: owner }));
  if ((await user.auth.signInWithPassword({ email, password })).error) throw new Error('Isolated owner login failed');
  http.get('https://thirdparty.qonto.com').intercept({ path: /^\/v2\/(bank_accounts|transactions)\?/, method: 'GET' }).reply(request => {
    const response = fixtureResponse(new URL(request.path, 'https://thirdparty.qonto.com'), { revision, scenario: 'recurring' });
    return { statusCode: response.status, data: JSON.stringify(response.body), responseOptions: { headers: { 'content-type': 'application/json' } } };
  }).persist();
  setGlobalDispatcher(http);
  await expect(fetch('https://forbidden-acceptance.invalid')).rejects.toThrow();
});
afterEach(async () => {
  setGlobalDispatcher(previousDispatcher);
  await http.close();
  if (owner) await checkWrite(admin.auth.admin.deleteUser(owner));
});

test('published HTTP history becomes an owner-confirmed expense; overrides, suppression and reexamination survive resync', async () => {
  expect(await sync()).toMatchObject({ success: true, analysisResult: { success: true, count: 1 } });
  const pending = (await workspace()).suggestions[0]!;
  expect(pending.evidence).toHaveLength(3);
  expect(pending.eligible).toBe(true);
  const before = await projection();
  expect(before.data.banking!.fullTransactions).toHaveLength(1003);
  expect(before.events).toHaveLength(0);
  const input = { suggestionId: pending.id, sourcePublication: pending.sourcePublication, command: { label: 'Synthetic edited subscription', amount_cents: 1500, day_of_month: 1, start_date: localDate(pending.nextDate), cashflow_kind: 'expense' as const, certainty: 'committed' as const, probability_basis_points: 10000 } };
  const ids = await Promise.all([confirmSuggestion(user, owner, input), confirmSuggestion(user, owner, input)]);
  expect(ids[0]).toBe(ids[1]);
  expect(await rows('recurring_cashflows')).toHaveLength(1);
  expect((await projection()).events).toEqual(expect.arrayContaining([expect.objectContaining({ amountCents: 1500 })]));
  await checkWrite(user.from('recurring_cashflows').update({ amount_cents: 1700 }).eq('id', ids[0]));
  expect((await sync()).success).toBe(true);
  expect(await rows('recurring_cashflows')).toMatchObject([{ id: ids[0], amount_cents: 1700, label: 'Synthetic edited subscription' }]);
  expect((await projection()).events.every(event => event.amountCents === 1700)).toBe(true);
  await checkWrite(user.from('recurring_cashflows').delete().eq('id', ids[0]));
  expect((await sync()).success).toBe(true);
  expect((await workspace()).suggestions).toHaveLength(0);
  expect((await workspace()).ignored).toMatchObject([{ id: pending.id }]);
  expect((await projection()).events).toHaveLength(0);
  await setSuggestionState(user, owner, pending.id, 'reexamine');
  expect((await workspace()).suggestions[0]?.eligible).toBe(false);
  expect(await analyze()).toEqual({ success: true, count: 1 });
  expect((await workspace()).suggestions).toMatchObject([{ id: pending.id, eligible: true }]);
});

test('association preserves existing fields; current paid month is excluded and reversed evidence restores it', async () => {
  expect((await sync()).success).toBe(true);
  const pending = (await workspace()).suggestions[0]!;
  const id = randomUUID();
  await checkWrite(user.from('recurring_cashflows').insert({ id, owner_user_id: owner, direction: 'outflow', cashflow_kind: 'expense', label: 'Synthetic existing charge', amount_cents: 1800, frequency: 'monthly', day_of_month: Number(today.slice(-2)), start_date: today, certainty: 'certain', probability_basis_points: 10000 }));
  const original = await rows('recurring_cashflows');
  await confirmSuggestion(user, owner, { suggestionId: pending.id, sourcePublication: pending.sourcePublication, existingExpenseId: id, command: { label: 'Unused proposed fields', amount_cents: 1000, day_of_month: 1, start_date: localDate(pending.nextDate), cashflow_kind: 'expense', certainty: 'committed', probability_basis_points: 10000 } });
  expect(await rows('recurring_cashflows')).toEqual(original);
  expect((await projection()).events.some(event => event.plannedDate.startsWith(today.slice(0, 7)))).toBe(false);
  revision = 1;
  expect((await sync()).success).toBe(true);
  expect((await projection()).events.some(event => event.plannedDate === today && event.amountCents === 1800)).toBe(true);
  revision = 2;
  expect((await sync()).success).toBe(true);
  expect((await projection()).events.some(event => event.plannedDate === today)).toBe(false);
  await checkWrite(user.from('recurring_cashflows').delete().eq('id', id));
  await setSuggestionState(user, owner, pending.id, 'reexamine');
  expect((await analyze()).success).toBe(true);
});

test('duplicate protection, stale source and failed analysis preserve decisions and banking success', async () => {
  expect((await sync()).success).toBe(true);
  const pending = (await workspace()).suggestions[0]!;
  const manual = randomUUID();
  await checkWrite(user.from('recurring_cashflows').insert({ id: manual, owner_user_id: owner, direction: 'outflow', cashflow_kind: 'expense', label: pending.label, amount_cents: pending.amountCents, frequency: 'monthly', day_of_month: 1, start_date: pending.nextDate }));
  expect((await workspace()).suggestions[0]!.possibleDuplicates).toHaveLength(1);
  const input = { suggestionId: pending.id, sourcePublication: pending.sourcePublication, command: { label: pending.label, amount_cents: pending.amountCents, day_of_month: 1, start_date: localDate(pending.nextDate), cashflow_kind: 'expense' as const, certainty: 'committed' as const, probability_basis_points: 10000 } };
  await expect(confirmSuggestion(user, owner, input)).rejects.toThrow('DETECTION_DUPLICATE');
  expect(await rows('recurring_cashflows')).toHaveLength(1);
  expect((await sync()).success).toBe(true);
  await expect(confirmSuggestion(user, owner, input)).rejects.toThrow('DETECTION_STALE');
  const fresh = (await workspace()).suggestions[0]!;
  await confirmSuggestion(user, owner, { ...input, sourcePublication: fresh.sourcePublication, allowDuplicate: true });
  expect(await rows('recurring_cashflows')).toHaveLength(2);
  const preserved = await rows('recurring_suggestions');
  const run = randomUUID();
  await checkWrite(admin.rpc('acquire_recurring_analysis', { p_owner_user_id: owner, p_run_id: run }));
  const result = await sync();
  expect(result).toMatchObject({ success: true, analysisResult: { success: false, code: 'DETECTION_LOCKED' } });
  expect(await rows('recurring_suggestions')).toEqual(preserved);
  expect((await rows('integrations'))[0]!.last_success_at).not.toBe(fresh.sourcePublication);
  await checkWrite(admin.rpc('fail_recurring_analysis', { p_owner_user_id: owner, p_run_id: run, p_error_code: 'DATABASE_ERROR' }));
  expect((await analyze()).success).toBe(true);
});
