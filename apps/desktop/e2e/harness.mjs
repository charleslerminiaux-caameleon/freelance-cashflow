// Test-only entry point, excluded from distributed files.
import {app} from 'electron';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const directory=await mkdtemp(join(tmpdir(),'fc-electron-e2e-'));
app.setPath('userData',directory);
app.on('will-quit',()=>{void rm(directory,{recursive:true,force:true});});
await import('../src/main.mjs');
