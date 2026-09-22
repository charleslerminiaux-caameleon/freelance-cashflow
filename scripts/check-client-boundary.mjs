import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
export async function checkClientBoundary(directory, canaries) {
  const forbidden = [...canaries, 'QONTO_SECRET_KEY', 'QONTO_LOGIN', 'thirdparty.qonto.com', 'acquire_banking_sync', 'stage_banking_page', 'acquire_recurring_analysis', 'publish_recurring_analysis', 'fail_recurring_analysis', 'acquire_direct_banking_sync', 'publish_pennylane_sync', 'b2b.revolut.com/api', 'api.bunq.com/v1', 'createPennylaneProvider', 'createRevolutProvider', 'createBunqProvider'];
  let count = 0;
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await visit(file);
      else {
        const content = await readFile(file, 'utf8');
        if (forbidden.some(marker => content.includes(marker))) throw new Error('Client/server boundary violation');
        count += 1;
      }
    }
  }
  await visit(directory);
  if (!count) throw new Error('Client boundary assets absent');
  return count;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.QONTO_LOGIN !== 'FAKE_QONTO_LOGIN_ACCEPTANCE_ONLY' || process.env.QONTO_SECRET_KEY !== 'FAKE_QONTO_SECRET_ACCEPTANCE_ONLY') throw new Error('Fake build canaries required');
  checkClientBoundary(process.env.E2E_STACK_PROJECT === 'jalon-2-qonto-tests' ? 'apps/web/.next-isolated/static' : 'apps/web/.next/static', [process.env.QONTO_LOGIN, process.env.QONTO_SECRET_KEY])
    .then(count => console.log(`PASS: ${count} client assets contain no provider credentials or server adapter/RPC boundary markers.`))
    .catch(() => { console.error('Client boundary verification failed'); process.exitCode = 1; });
}
