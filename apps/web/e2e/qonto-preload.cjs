// Test-only process preload. Every external connection is denied by default.
const { MockAgent, setGlobalDispatcher } = require('undici');
const agent = new MockAgent();
agent.disableNetConnect();
agent.enableNetConnect(/^(127\.0\.0\.1|localhost):(56321|3200)$/);
setGlobalDispatcher(agent);
const origin = 'https://thirdparty.qonto.com';
let run = 0;
const fixtures = require('./qonto-fixtures.mjs');
// Register the dispatcher synchronously before Next bootstraps.
const { fixtureResponse, createRecurringCalendar } = fixtures;
const calendar = process.env.E2E_QONTO_SCENARIO === 'recurring'
  ? createRecurringCalendar(new Date(process.env.E2E_RECURRING_ANCHOR)) : undefined;
{
  agent.get(origin).intercept({ path: /^\/v2\/(bank_accounts|transactions)\?/, method: 'GET' }).reply((request) => {
    const url = new URL(request.path, origin);
    if (url.pathname === '/v2/bank_accounts' && url.searchParams.get('page') === '1') run += 1;
    const response = fixtureResponse(url, { failure: run >= 3 ? 'auth' : '', scenario: process.env.E2E_QONTO_SCENARIO ?? '', calendar });
    return { statusCode: response.status, data: JSON.stringify(response.body), responseOptions: { headers: { 'content-type': 'application/json', ...response.headers } } };
  }).persist();
  // A negative probe proves fail-closed interception without leaving this process.
  module.exports.ready = fetch('https://unmatched-qonto-acceptance.invalid').then(
    () => { throw new Error('HTTP interception unavailable'); },
    () => { process.env.QONTO_TEST_INTERCEPTION_READY = '1'; },
  );
}
