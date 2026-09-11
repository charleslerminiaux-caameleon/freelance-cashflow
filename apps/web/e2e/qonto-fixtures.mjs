// Synthetic fixtures only. No production module imports this file.
export const canaries = ['FAKE_QONTO_LOGIN_ACCEPTANCE_ONLY', 'FAKE_QONTO_SECRET_ACCEPTANCE_ONLY', 'SYNTHETIC_PRIVATE_LABEL_CANARY'];
export const fakeIban = 'FR00' + '0'.repeat(19) + '1234';
const instant = '2026-09-10T09:00:00.000Z';
const meta = (page, count) => ({ current_page: page, next_page: page === 1 ? 2 : null, prev_page: page === 1 ? null : 1, total_pages: 2, total_count: count, per_page: 100 });
export function fixtureResponse(url, { revision = 0, failure = '', scenario = '', calendar } = {}) {
  if (scenario === 'recurring') return recurringResponse(url, revision, calendar);
  const page = Number(url.searchParams.get('page'));
  if (failure === 'auth') return { status: 401, body: { error: canaries.join(' ') + fakeIban } };
  if (failure === 'invalid') return { status: 200, body: { unsafe: canaries.join(' ') + fakeIban } };
  if (failure === 'rate') return { status: 429, body: {}, headers: { 'retry-after': '0' } };
  if (failure === 'page2' && url.pathname === '/v2/transactions' && page === 2) return { status: 503, body: { error: canaries.join(' ') } };
  if (url.pathname === '/v2/bank_accounts') {
    return { status: 200, body: { bank_accounts: [{ id: `fixture-account-${page}`, name: `Compte fictif ${page}`, status: 'active', iban: fakeIban, currency: 'EUR', balance_cents: page === 1 ? 300000 + revision * 10000 : 200000, authorized_balance_cents: null, updated_at: instant }], meta: meta(page, 2) } };
  }
  if (url.pathname === '/v2/transactions') {
    const account = url.searchParams.get('bank_account_id');
    return { status: 200, body: { transactions: [{ transaction_id: `${account}-transaction-${page}`, bank_account_id: account, amount_cents: 1234, side: page === 1 ? 'debit' : 'credit', currency: 'EUR', label: 'Mouvement fictif', emitted_at: instant, settled_at: null, updated_at: revision ? '2026-09-10T09:01:00.000Z' : instant, status: revision ? 'completed' : account.endsWith('1') ? (page === 1 ? 'pending' : 'completed') : (page === 1 ? 'declined' : 'reversed') }], meta: meta(page, 2) } };
  }
  throw new Error('Unexpected test HTTP path');
}

// Synthetic owners start near noon, so both Node and the live SQL business date
// stay on one day through these bounded acceptance runs, including Paris midnight.
export function createRecurringCalendar(now = new Date()) {
  const offsetHours = 12 - now.getUTCHours();
  const timezone = offsetHours === 0 ? 'Etc/GMT' : `Etc/GMT${offsetHours > 0 ? '-' : '+'}${Math.abs(offsetHours)}`;
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(now);
  return Object.freeze({ today, timezone, offsetHours, instant: now.toISOString() });
}

// IDs are stable across revisions, allowing the real publication update path.
function recurringResponse(url, revision, calendar) {
  if (!calendar) throw new Error('Recurring fixture requires a shared owner calendar');
  const { today, offsetHours } = calendar;
  const [year, month] = today.split('-').map(Number);
  const atMonth = offset => new Date(Date.UTC(year, month - 1 + offset, 1, 12 - offsetHours)).toISOString();
  const updated = new Date(Date.parse(calendar.instant) + revision * 60_000).toISOString();
  const account = 'synthetic-recurring-account';
  let items;
  let key;
  if (url.pathname === '/v2/bank_accounts') {
    key = 'bank_accounts';
    items = [{ id: account, name: 'Compte fictif récurrences', status: 'active', iban: fakeIban, currency: 'EUR', balance_cents: 500000, authorized_balance_cents: null, updated_at: updated }];
  } else if (url.pathname === '/v2/transactions' && url.searchParams.get('bank_account_id') === account) {
    key = 'transactions';
    const transaction = (id, label, date, side, status = 'completed') => ({ transaction_id: id, bank_account_id: account, amount_cents: 1000, side, currency: 'EUR', label, emitted_at: date, settled_at: date, updated_at: updated, status });
    items = [
      ...Array.from({ length: 1000 }, (_, index) => transaction(`synthetic-noise-${index}`, `Synthetic inflow ${index}`, atMonth(0), 'credit')),
      ...[-2, -1, 0].map(offset => transaction(`synthetic-month-${offset}`, 'Synthetic cloud subscription', atMonth(offset), 'debit', revision === 1 && offset === 0 ? 'reversed' : 'completed')),
    ];
  } else throw new Error('Unexpected recurring fixture request');
  const page = Number(url.searchParams.get('page'));
  const total = Math.ceil(items.length / 100);
  if (!Number.isInteger(page) || page < 1 || page > total) throw new Error('Unexpected recurring fixture page');
  return { status: 200, body: { [key]: items.slice((page - 1) * 100, page * 100), meta: { current_page: page, next_page: page < total ? page + 1 : null, prev_page: page > 1 ? page - 1 : null, total_pages: total, total_count: items.length, per_page: 100 } } };
}
