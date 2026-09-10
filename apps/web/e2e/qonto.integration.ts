import { afterAll, beforeAll, expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createQontoProvider, synchronizeBanking, createSyncLogger, type BankingSyncStore } from '@fc/integrations/server';
import { createBankingSyncStore } from '../src/features/integrations/sync-repository';
import { getBankingSnapshot } from '../src/features/banking/repository';
import { selectOpeningBalance } from '../src/features/dashboard/view-model';
import { localDate, moneyCents } from '@fc/shared';
import { canaries, fakeIban, fixtureResponse } from './qonto-fixtures.mjs';

if (process.env.E2E_STACK_PROJECT !== 'jalon-2-qonto-tests' || process.env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:56321') throw new Error('Dedicated test database required');
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
let owner: string;
let revision = 0;
let failure = '';
let gate: (() => Promise<void>) | undefined;
const requests: URL[] = [];
const logs: unknown[] = [];
const log = createSyncLogger(event => logs.push(event));
const store = createBankingSyncStore(client);
const acquiredWindows: Awaited<ReturnType<BankingSyncStore['acquire']>>[] = [];
const acquire = store.acquire.bind(store);
store.acquire = async (ownerId, runId) => {
  const window = await acquire(ownerId, runId);
  acquiredWindows.push(window);
  return window;
};
const provider = createQontoProvider({ login: canaries[0], secretKey: canaries[1], sleep: async () => {}, fetch: async (input, options) => {
  const url = new URL(String(input));
  expect(url.origin).toBe('https://thirdparty.qonto.com');
  expect(options?.method).toBe('GET');
  expect(options?.redirect).toBe('error');
  expect(options?.cache).toBe('no-store');
  requests.push(url);
  if (gate) await gate();
  const response = fixtureResponse(url, { revision, failure });
  return new Response(JSON.stringify(response.body), { status: response.status, headers: response.headers });
} });
const sync = () => synchronizeBanking({ ownerUserId: owner, runId: randomUUID(), timezone: 'Europe/Paris', provider, store, log });
async function rows(table: string) {
  const { data, error } = await client.from(table).select('*').eq('owner_user_id', owner).order('id');
  if (error) throw new Error('Acceptance database read failed');
  return data!;
}
const visible = async () => ({ accounts: await rows('bank_accounts'), transactions: await rows('bank_transactions') });
beforeAll(async () => {
  const { count, error } = await client.from('app_settings').select('*', { count: 'exact', head: true });
  if (error || count !== 0) throw new Error('Refusing existing singleton owner');
  const { data, error: createError } = await client.auth.admin.createUser({ email: 'integration@example.test', email_confirm: true });
  if (createError || !data.user) throw new Error('Acceptance owner creation failed');
  owner = data.user.id;
  const { error: settingsError } = await client.from('app_settings').insert({ owner_user_id: owner });
  if (settingsError) throw new Error('Acceptance settings creation failed');
});
afterAll(async () => {
  if (owner) { const { error } = await client.auth.admin.deleteUser(owner); if (error) throw new Error('Acceptance owner cleanup failed'); }
});

test('real RPC publication, HTTP mapping, repeat/update/recovery/failures and concurrent service calls', async () => {
  expect(await sync()).toEqual({ success: true, created: 6, updated: 0 });
  expect(requests).toHaveLength(6);
  const initial = await visible();
  expect(initial.accounts).toHaveLength(2);
  expect(initial.transactions).toHaveLength(4);
  const mappings = await client.from('provider_object_mappings').select('*').eq('owner_user_id', owner);
  expect(mappings.error).toBeNull();
  expect(mappings.data).toHaveLength(6);
  for (const account of initial.accounts) expect(mappings.data!.some(row => row.external_id === account.external_id && row.bank_account_id === account.id)).toBe(true);
  for (const transaction of initial.transactions) expect(mappings.data!.some(row => row.external_id === transaction.external_id && row.bank_transaction_id === transaction.id)).toBe(true);
  expect(initial.accounts.every(a => a.iban_masked !== fakeIban && a.iban_masked.includes('•'))).toBe(true);
  expect(new Set(initial.transactions.map(t => t.status))).toEqual(new Set(['pending', 'completed', 'declined', 'reversed']));
  expect(new Set(initial.transactions.map(t => t.bank_account_id))).toEqual(new Set(initial.accounts.map(a => a.id)));
  expect(initial.transactions.every(t => t.amount_cents === 1234 && t.transaction_date === '2026-09-10')).toBe(true);
  const firstControl = (await rows('integrations'))[0];
  const firstRun = (await rows('sync_runs'))[0];
  expect(firstControl.last_published_updated_to).toBe(firstRun.updated_to);
  expect(firstRun.created_count).toBe(6);
  const firstWindow = requests.find(url => url.pathname === '/v2/transactions')!;
  expect(firstWindow.searchParams.get('created_at_from')).toBe(acquiredWindows[0]!.initialCreatedFromInstant);
  expect(firstWindow.searchParams.get('updated_at_to')).toBe(acquiredWindows[0]!.updatedTo);
  expect(firstWindow.searchParams.getAll('status[]')).toEqual(['pending', 'completed', 'declined', 'reversed']);
  const banking = await getBankingSnapshot(client, owner, { historyPage: 1 });
  const opening = selectOpeningBalance({ banking, settings: { currency: 'EUR', timezone: 'Europe/Paris', manualCurrentBalanceCents: moneyCents(100000), manualBalanceAsOf: localDate('2026-09-10'), safetyThresholdCents: moneyCents(0), defaultForecastHorizonDays: 90, defaultScenario: 'certain' } });
  expect(opening.source).toBe('qonto');
  expect(opening.balanceCents).toBe(500000);
  expect(banking.history.items).toHaveLength(4);
  requests.length = 0;
  expect(await sync()).toEqual({ success: true, created: 0, updated: 0 });
  expect((await visible()).transactions.map(t => t.id)).toEqual(initial.transactions.map(t => t.id));
  expect((await visible()).accounts.map(a => a.id)).toEqual(initial.accounts.map(a => a.id));
  const nextWindow = requests.find(url => url.pathname === '/v2/transactions')!;
  expect(Date.parse(nextWindow.searchParams.get('updated_at_from')!)).toBe(Date.parse(firstControl.last_published_updated_to) - 300000);
  revision = 1;
  expect(await sync()).toEqual({ success: true, created: 0, updated: 5 });
  expect((await rows('bank_transactions')).every(t => t.status === 'completed')).toBe(true);
  expect((await rows('bank_accounts')).reduce((sum, a) => sum + a.current_balance_cents, 0)).toBe(510000);
  for (const [mode, code] of [['page2', 'PROVIDER_UNAVAILABLE'], ['auth', 'PROVIDER_AUTH_EXPIRED'], ['invalid', 'PROVIDER_INVALID_RESPONSE'], ['rate', 'PROVIDER_RATE_LIMIT']] as const) {
    const previous = await visible();
    const control = (await rows('integrations'))[0];
    failure = mode; revision += 1;
    const result = await sync();
    expect(result).toEqual({ success: false, code });
    expect(await visible()).toEqual(previous);
    const after = (await rows('integrations'))[0];
    expect(after.last_published_updated_to).toBe(control.last_published_updated_to);
    expect(after.last_error_code).toBe(code);
    expect((await rows('sync_runs')).some(run => run.status === 'failed' && run.error_code === code)).toBe(true);
    failure = '';
    expect((await sync()).success).toBe(true);
    expect((await visible()).transactions.map(t => t.id)).toEqual(initial.transactions.map(t => t.id));
  }
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  gate = async () => { entered(); await wait; };
  const first = sync();
  await started;
  expect(await sync()).toEqual({ success: false, code: 'SYNC_LOCKED' });
  release(); gate = undefined;
  expect((await first).success).toBe(true);
  log({ event: 'sync_failed', runId: randomUUID(), code: 'PROVIDER_UNAVAILABLE', durationMs: 1, payload: canaries.join(' ') });
  const serialized = JSON.stringify(logs);
  expect(logs.length).toBeGreaterThan(10);
  for (const marker of [...canaries, fakeIban]) expect(serialized.includes(marker)).toBe(false);
});
