import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { tiendanubeReturnPath, safeAppReturn, legacyTiendanubeReturn, loginPath, signupPath } from '../src/lib/oauthNavigation.js';

test('callback vuelve a la aplicación y conserva la tienda al pasar por login y registro', () => {
  const target = tiendanubeReturnPath({ storeId: '7570182' });
  assert.equal(target, '/app?tab=tiendanube&tiendanube_store_id=7570182');
  for (const auth of [loginPath(target), signupPath(target)]) {
    const query = new URL(auth, 'https://example.com').searchParams;
    assert.equal(safeAppReturn(query.get('returnTo')), target);
  }
  assert.equal(legacyTiendanubeReturn(new URLSearchParams('tab=tiendanube&tiendanube_store_id=7570182')), target);
  assert.equal(legacyTiendanubeReturn(new URLSearchParams('tab=tiendanube')), null);
});
test('los destinos de login no permiten redirecciones externas ni rutas arbitrarias', () => {
  for (const target of ['https://attacker.com', '//attacker.com/app', '/app/../login', '/app/other', '/applications', '/app\\@attacker.com', null]) {
    assert.equal(safeAppReturn(target), '/app', String(target));
  }
  const target = safeAppReturn('/app?tab=other&redirect=https://attacker.com&tiendanube_store_id=7570182');
  assert.equal(target, '/app?tab=tiendanube&tiendanube_store_id=7570182');
});
test('errores de OAuth se codifican una vez y quedan acotados', () => {
  const error = 'No se autorizó el acceso al 50% / promoción';
  const target = tiendanubeReturnPath({ error });
  assert.equal(new URL(target, 'https://example.com').searchParams.get('tiendanube_error'), error);
  assert.equal(safeAppReturn(target), target);
  assert.equal(new URL(tiendanubeReturnPath({ error: 'x'.repeat(1000) }), 'https://example.com').searchParams.get('tiendanube_error').length, 500);
});
test('sesión OAuth ISO vencida hoy no pasa el filtro de fecha de SQLite', async () => {
  const db = createClient({ url: 'file::memory:' });
  try {
    await db.execute('CREATE TABLE sessions (expires_at TEXT)');
    const now = new Date(), expired = new Date(now.getTime() - 60_000).toISOString(), valid = new Date(now.getTime() + 60_000).toISOString();
    await db.execute({ sql: 'INSERT INTO sessions VALUES (?),(?)', args: [expired, valid] });
    const rows = (await db.execute("SELECT expires_at FROM sessions WHERE julianday(expires_at) > julianday('now')")).rows;
    assert.deepEqual(rows.map((r) => r.expires_at), [valid]);
  } finally { db.close(); }
});
