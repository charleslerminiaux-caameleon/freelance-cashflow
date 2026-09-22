import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRestoreTarget } from './test-backup-restore.mjs';
test('restoration rejects every source or destination outside its dedicated disposable boundary', () => {
  assert.doesNotThrow(() => validateRestoreTarget('supabase_db_jalon-2-qonto-tests', 'libra_restore_probe'));
  for (const [container, database] of [
    ['supabase_db_bardda', 'libra_restore_probe'],
    ['supabase_db_manual-cashflow-vertical', 'libra_restore_probe'],
    ['supabase_db_jalon-2-qonto-tests', 'postgres'],
    ['supabase_db_jalon-2-qonto-tests', 'libra_restore_probe;drop database postgres'],
  ]) assert.throws(() => validateRestoreTarget(container, database));
});
