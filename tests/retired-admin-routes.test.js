import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Las reparaciones históricas movían datos entre espacios: deben seguir retiradas y sin acceso a la base.
for (const route of ['reparar', 'migrate-legacy']) {
  test(`/api/admin/${route} permanece retirada (410) y no usa la base`, () => {
    const source = readFileSync(new URL(`../src/app/api/admin/${route}/route.js`, import.meta.url), 'utf8');
    assert.match(source, /410/);
    assert.doesNotMatch(source, /from ['"]@\/lib\/db['"]|\.execute\(|UPDATE |DELETE |INSERT /);
  });
}
