import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@libsql/client';
import { createCrossSellingRepository } from '../src/lib/crossselling/repository.js';
import { createCrossSellingService } from '../src/lib/crossselling/service.js';
import { authorizePublication } from '../src/lib/crossselling/publication-auth.js';
import { buildSnapshot } from '../src/lib/crossselling/engine/online-crossselling.js';
import { snapshotRevision, publicationSignature } from '../src/lib/crossselling/engine/publish-protocol.js';
import { createTiendanubeClient } from '../src/lib/tiendanubeClient.js';

const now = new Date('2026-10-16T12:00:00Z');
const product = { id: '1', codigo: 'SKU', nombre: 'Teclado', precioFinal: 12100, costo: 9000, iva: 21, stock: 3 };
const snapshot = buildSnapshot({ storeId: '7570182', products: [product], rules: [], settings: { maxSugerencias: 3, descuentoMaximoPct: 25, margenMinimoPct: 10 }, now });
const tnProduct = { id: 1, name: { es: 'Teclado' }, published: true, variants: [{ id: 2, sku: 'SKU', stock_management: true, stock: 2, price: '12100' }] };

test('los archivos distribuidos coinciden con el manifest del motor', () => {
  const base = new URL('../src/lib/crossselling/engine/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', base)));
  for (const [file, hash] of Object.entries(manifest.files)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, base))).digest('hex'), hash, file);
});
test('firma queda vinculada a una sola tienda y no expone la clave', () => {
  const key = 'k'.repeat(32), path = '/api/cross-selling/config?storeId=7570182', body = JSON.stringify({ snapshot });
  const timestamp = String(now.getTime());
  const signature = publicationSignature({ key, method: 'PUT', path, timestamp, body });
  const request = new Request('https://example.com' + path, { method: 'PUT', headers: { 'x-mostrador-signature': signature, 'x-mostrador-timestamp': timestamp } });
  assert.equal(authorizePublication({ request, rawBody: body, keysJson: JSON.stringify({ 7570182: key }), now: now.getTime() }), '7570182');
  assert.equal(authorizePublication({ request, rawBody: body + ' ', keysJson: JSON.stringify({ 7570182: key }), now: now.getTime() }), null);
  assert.equal(authorizePublication({ request, rawBody: body, keysJson: '{}', now: now.getTime() }), null);
});
test('repositorio: último snapshot válido, reintentos idempotentes y aislamiento', async () => {
  const db = createClient({ url: 'file::memory:' });
  try {
    const repository = createCrossSellingRepository(db);
    const input = { storeId: '7570182', workspaceId: 12, revision: snapshotRevision(snapshot), snapshot, catalog: [tnProduct], diagnostics: {}, publishedAt: now.toISOString() };
    await repository.save(input); await repository.save(input);
    await assert.rejects(repository.save({ ...input, workspaceId: 13 }), /otro espacio/);
    const older = { ...snapshot, generatedAt: '2026-10-15T12:00:00Z', enabled: true };
    await assert.rejects(repository.save({ ...input, snapshot: older, revision: snapshotRevision(older) }), /anterior/);
    assert.equal((await repository.get('7570182')).revision, input.revision);
    assert.equal(await repository.get('78394'), null);
  } finally { db.close(); }
});
test('publicación preparada no activa la tienda y una falla no reemplaza configuración', async () => {
  const db = createClient({ url: 'file::memory:' });
  try {
    const repository = createCrossSellingRepository(db);
    let failed = false;
    const client = { getStore: async () => ({ id: 7570182, original_domain: 'logitrackprueba.mitiendanube.com' }),
      downloadCatalog: async () => { if (failed) throw new Error('sin catálogo'); return [tnProduct]; },
      listPromotions: async () => { throw Object.assign(new Error('forbidden'), { status: 403 }); } };
    const service = createCrossSellingService({ repository, lookupConnection: async () => ({ workspaceId: 12, config: { storeId: '7570182', accessToken: 'private', scope: 'read_products' } }), clientFor: () => client, now: () => now });
    const input = { snapshot, revision: snapshotRevision(snapshot) };
    const result = await service.publish('7570182', input);
    assert.equal(result.ready, false); assert.equal(result.enabled, false); assert.equal(result.promotionsHttpStatus, 403);
    assert.equal(result.mappedProducts, 1);
    assert.equal(JSON.stringify(result).includes('9000'), false); assert.equal(JSON.stringify(result).includes('private'), false);
    failed = true; await assert.rejects(service.publish('7570182', input), /sin catálogo/);
    assert.equal((await service.status('7570182')).revision, input.revision);
    await assert.rejects(service.publish('78394', input), /Tienda o versión/);
  } finally { db.close(); }
});
test('una conexión ausente o de otra tienda bloquea la publicación', async () => {
  for (const c of [null, { workspaceId: 12, config: { storeId: '78394', accessToken: 'wrong' } }]) {
    const service = createCrossSellingService({ repository: {}, lookupConnection: async () => c, clientFor: () => assert.fail('No consultar otra tienda'), now: () => now });
    await assert.rejects(service.publish('7570182', { snapshot, revision: snapshotRevision(snapshot) }), /Conectá/);
  }
});
test('cliente Tiendanube usa contratos de catálogo, promociones y callback oficiales', async () => {
  const original = globalThis.fetch, calls = [];
  try {
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      const payload = url.includes('/products?') ? [tnProduct] : url.endsWith('/promotions') && !options.method ? { data: [{ id: 'promo' }] } : {};
      return new Response(JSON.stringify(payload), { status: 200 });
    };
    const client = createTiendanubeClient({ accessToken: 'secret', storeId: '7570182' });
    assert.equal((await client.downloadCatalog()).length, 1);
    assert.equal((await client.listPromotions())[0].id, 'promo');
    await client.createPromotion({ name: 'test', active: false });
    await client.updatePromotion('promo', { active: false });
    await client.deletePromotion('promo');
    await client.setDiscountCallback('https://example.com/callback');
    assert.equal(calls[2].options.method, 'POST'); assert.equal(calls[3].options.method, 'PATCH');
    assert.equal(calls[4].options.method, 'DELETE'); assert.equal(calls[5].options.method, 'PUT');
    assert.equal(JSON.parse(calls[5].options.body).url, 'https://example.com/callback');
    await assert.rejects(client.setDiscountCallback('http://example.com'), /HTTPS/);
  } finally { globalThis.fetch = original; }
});
