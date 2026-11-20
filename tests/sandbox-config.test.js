import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sandboxEnvironment } from '../scripts/sandbox-config.mjs';

test('el arranque local excluye variables y archivos de producción', () => {
  const root = mkdtempSync(join(tmpdir(), 'geomodi-sandbox-'));
  try {
    writeFileSync(join(root, '.env.local'), 'DATABASE_URL=https://production.invalid\nSOME_FUTURE_SECRET=production\nNEXT_PUBLIC_APP_URL=https://production.invalid\n');
    const env = sandboxEnvironment({ PATH:'test-path', GEOMODI_SANDBOX_CLERK_PUBLISHABLE_KEY:'pk_test_example', GEOMODI_SANDBOX_CLERK_SECRET_KEY:'sk_test_example', REDIS_URL:'production', ANOTHER_SECRET:'production' }, root);
    assert.match(env.DATABASE_URL, /^file:/);
    assert.equal(env.SOME_FUTURE_SECRET, '');
    assert.equal(env.NEXT_PUBLIC_APP_URL, 'http://localhost:3000');
    assert.equal(env.REDIS_URL, undefined);
    assert.equal(env.ANOTHER_SECRET, undefined);
    assert.equal(env.PATH, 'test-path');
    assert.throws(() => sandboxEnvironment({ GEOMODI_SANDBOX_CLERK_PUBLISHABLE_KEY:'pk_live_prod', GEOMODI_SANDBOX_CLERK_SECRET_KEY:'sk_live_prod' }, root), /claves de prueba/);
  } finally { unlinkSync(join(root, '.env.local')); rmdirSync(root); }
});
