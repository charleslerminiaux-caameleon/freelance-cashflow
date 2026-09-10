// Synthetic fixtures only. No production module imports this file.
export const canaries = ['FAKE_QONTO_LOGIN_ACCEPTANCE_ONLY', 'FAKE_QONTO_SECRET_ACCEPTANCE_ONLY', 'SYNTHETIC_PRIVATE_LABEL_CANARY'];
export const fakeIban = 'FR00' + '0'.repeat(19) + '1234';
const instant = '2026-09-10T09:00:00.000Z';
const meta = (page, count) => ({ current_page: page, next_page: page === 1 ? 2 : null, prev_page: page === 1 ? null : 1, total_pages: 2, total_count: count, per_page: 100 });
export function fixtureResponse(url, { revision = 0, failure = '' } = {}) {
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
