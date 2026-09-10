import { main } from './run-isolated-tests.mjs';
main('integration').catch(error => { console.error(error.message); process.exitCode = 1; });
