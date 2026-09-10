const { spawn } = require('node:child_process');
const path = require('node:path');
if (process.env.E2E_STACK_PROJECT !== 'jalon-2-qonto-tests' || process.env.NEXT_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:56321') throw new Error('Dedicated stack required');
process.env.QONTO_LOGIN = 'FAKE_QONTO_LOGIN_ACCEPTANCE_ONLY';
process.env.QONTO_SECRET_KEY = 'FAKE_QONTO_SECRET_ACCEPTANCE_ONLY';
process.env.NEXT_TELEMETRY_DISABLED = '1';
// Import preload into the actual Next process, never into application code.
process.env.NODE_OPTIONS = `--require ${JSON.stringify(path.join(__dirname, 'qonto-preload.cjs'))}`;
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3200'], { stdio: 'inherit', env: process.env });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
