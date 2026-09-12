import { cp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const databaseProbes = ['scripts/test-banking-concurrency.mjs', 'scripts/test-automatic-banking-concurrency.mjs', 'scripts/test-recurring-concurrency.mjs'];
export const browserSpecs = ['manual-cashflow.spec.ts', 'qonto-sync.spec.ts', 'recurring-detection.spec.ts', 'dashboard-workflows.spec.ts'];
export const project = 'jalon-2-qonto-tests';
export const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const stack = join(root, '.isolated-tests');
export function assertDedicatedConfig(config) {
  const section = name => config.match(new RegExp(`\\[${name}\\]([\\s\\S]*?)(?=\\n\\[|$)`))?.[1] ?? '';
  if (!/^project_id\s*=\s*"jalon-2-qonto-tests"\s*$/m.test(config)
    || !/^port\s*=\s*56321\s*$/m.test(section('api'))
    || !/^port\s*=\s*56322\s*$/m.test(section('db'))) throw new Error('Refusing non-dedicated stack');
}
export async function prepareStack(source, destination) {
  const configPath = join(destination, 'supabase/config.toml');
  try { assertDedicatedConfig(await readFile(configPath, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    try {
      if ((await readdir(destination)).length) throw new Error('Refusing unowned non-dedicated directory');
    } catch (directoryError) { if (directoryError.code !== 'ENOENT') throw directoryError; }
  }
  const config = (await readFile(join(source, 'supabase/config.toml'), 'utf8'))
    .replace(/^project_id\s*=.*$/m, `project_id = "${project}"`)
    .replace(/^(\s*(?:port|shadow_port|smtp_port|pop3_port)\s*=\s*)55(3\d\d)\s*$/gm, '$156$2')
    .replace(/^inspector_port\s*=.*$/m, 'inspector_port = 8283');
  assertDedicatedConfig(config);
  await mkdir(join(destination, 'supabase'), { recursive: true });
  await writeFile(configPath, config);
  for (const directory of ['migrations', 'tests']) {
    await rm(join(destination, 'supabase', directory), { recursive: true, force: true });
    await cp(join(source, 'supabase', directory), join(destination, 'supabase', directory), { recursive: true });
  }
  await cp(join(source, 'supabase/seed.sql'), join(destination, 'supabase/seed.sql'));
}
export function parseStatus(status) {
  const values = {};
  for (const line of status.split('\n')) {
    const match = /^([A-Z_]+)="([^"\r\n]*)"$/.exec(line.trim());
    if (match) values[match[1]] = match[2];
  }
  if (values.API_URL !== 'http://127.0.0.1:56321' || !values.ANON_KEY || !values.SERVICE_ROLE_KEY) throw new Error('Refusing non-dedicated status');
  return { NEXT_PUBLIC_SUPABASE_URL: values.API_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: values.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY, E2E_STACK_PROJECT: project };
}
export function testEnvironment(inherited = process.env) {
  const env = { ...inherited, QONTO_LOGIN: 'FAKE_QONTO_LOGIN_ACCEPTANCE_ONLY', QONTO_SECRET_KEY: 'FAKE_QONTO_SECRET_ACCEPTANCE_ONLY', NEXT_TELEMETRY_DISABLED: '1' };
  for (const key of ['NODE_OPTIONS', 'FORCE_COLOR', 'NO_COLOR', 'E2E_BASE_URL', 'E2E_QONTO_SCENARIO', 'E2E_RECURRING_ANCHOR']) delete env[key];
  return env;
}
// Child output is captured: neither status credentials nor arbitrary process errors are printed.
export function run(command, args, { cwd = root, env = testEnvironment(), show = false } = {}) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (show) {
    const secrets = [env.SUPABASE_SERVICE_ROLE_KEY, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, env.QONTO_LOGIN, env.QONTO_SECRET_KEY].filter(Boolean);
    let output = (result.stdout ?? '') + (result.stderr ?? '');
    for (const value of secrets) output = output.replaceAll(value, '[REDACTED]');
    console.log(output);
  }
  if (result.status !== 0) throw new Error(`Acceptance command failed: ${command} (exit ${result.status ?? 'unavailable'})`);
  return result.stdout;
}
export function cli(args, options = {}) {
  return run('corepack', ['pnpm', 'dlx', 'supabase@2.116.0', ...args], { cwd: stack, ...options });
}
export async function main(mode = 'all') {
  if (!['all', 'db', 'integration', 'e2e', 'build', 'stop'].includes(mode)) throw new Error('Unknown isolated test mode');
  await prepareStack(root, stack);
  if (mode === 'stop') { cli(['stop', '--no-backup']); return; }
  if (mode === 'build') {
    const env = { ...testEnvironment(), NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fake-build-anon', SUPABASE_SERVICE_ROLE_KEY: 'fake-build-service' };
    env.NODE_OPTIONS = `--require ${JSON.stringify(join(root, 'apps/web/e2e/qonto-preload.cjs'))}`;
    run('corepack', ['pnpm', 'build'], { env, show: true });
    run('node', ['scripts/check-client-boundary.mjs'], { env, show: true });
    return;
  }
  cli(['start']);
  // Immediately recheck identity before every destructive operation.
  assertDedicatedConfig(await readFile(join(stack, 'supabase/config.toml'), 'utf8'));
  const env = { ...testEnvironment(), ...parseStatus(cli(['status', '--output', 'env'])) };
  if (mode === 'db' || mode === 'all') {
    cli(['db', 'reset', '--local']);
    cli(['test', 'db'], { show: true });
    for (const probe of databaseProbes) run('node', [probe], { env, show: true });
  }
  if (mode === 'integration' || mode === 'all') run('corepack', ['pnpm', '--filter', '@fc/web', 'exec', 'vitest', 'run', '--config', 'e2e/integration.config.ts'], { env, show: true });
  if (mode === 'e2e' || mode === 'all') {
    for (const file of browserSpecs) {
      run('corepack', ['pnpm', '--filter', '@fc/web', 'exec', 'playwright', 'test', file], { env: { ...env, E2E_QONTO_SCENARIO: file === 'recurring-detection.spec.ts' ? 'recurring' : file === 'dashboard-workflows.spec.ts' ? 'dashboard' : '', E2E_RECURRING_ANCHOR: new Date().toISOString() }, show: true });
    }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
