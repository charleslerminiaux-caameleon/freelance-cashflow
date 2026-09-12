import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecurringCalendar, fixtureResponse } from '../apps/web/e2e/qonto-fixtures.mjs';

const url = new URL('https://thirdparty.qonto.com/v2/transactions?bank_account_id=synthetic-recurring-account&page=11');
test('recurring pages retain the supplied owner calendar across a Paris month boundary', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-30T21:59:59Z') });
  // Local noon on Sep 30 in the synthetic owner timezone; SQL remains on this
  // same day when Paris crosses midnight a second later.
  const calendar = { today: '2026-09-30', timezone: 'Etc/GMT+9', offsetHours: -9, instant: '2026-09-30T21:59:59.000Z' };
  const before = fixtureResponse(url, { scenario: 'recurring', calendar });
  t.mock.timers.setTime(new Date('2026-09-30T22:00:01Z').valueOf());
  const after = fixtureResponse(url, { scenario: 'recurring', calendar });
  assert.deepEqual(after, before);
  assert.deepEqual(after.body.transactions.map(row => row.emitted_at), [
    '2026-07-01T21:00:00.000Z', '2026-08-01T21:00:00.000Z', '2026-09-01T21:00:00.000Z',
  ]);
});

for (const instant of ['2026-12-31T23:59:59Z', '2027-01-01T00:00:01Z', '2026-03-29T01:00:00Z', '2026-10-25T01:00:00Z']) {
  test(`fresh calendar aligns owner and fixture dates around ${instant}`, () => {
    const now = new Date(instant);
    const calendar = createRecurringCalendar(now);
    const ownerDate = new Intl.DateTimeFormat('sv-SE', { timeZone: calendar.timezone });
    const ownerHour = new Intl.DateTimeFormat('en-GB', { timeZone: calendar.timezone, hour: '2-digit', hourCycle: 'h23' });
    assert.equal(ownerHour.format(now), '12');
    assert.equal(ownerDate.format(new Date(now.valueOf() + 180_000)), calendar.today);
    const result = fixtureResponse(url, { scenario: 'recurring', calendar });
    const transaction = result.body.transactions.at(-1);
    assert.equal(ownerDate.format(new Date(transaction.emitted_at)), `${calendar.today.slice(0, 7)}-01`);
    assert.equal(transaction.updated_at, now.toISOString());
  });
}

test('history workflow begins with one debit and exposes a second same-series transaction only on request', () => {
  const calendar = createRecurringCalendar();
  const request = new URL('https://thirdparty.qonto.com/v2/transactions?bank_account_id=synthetic-recurring-account&page=1');
  const first = fixtureResponse(request, { scenario: 'dashboard', calendar });
  assert.equal(first.body.transactions.length, 1);
  assert.equal(first.body.transactions[0].status, 'completed');
  const next = fixtureResponse(request, { scenario: 'dashboard', calendar, revision: 2 });
  assert.equal(next.body.transactions.length, 2);
  assert.notEqual(next.body.transactions[0].transaction_id, next.body.transactions[1].transaction_id);
  assert.equal(next.body.transactions[0].label, next.body.transactions[1].label);
});
