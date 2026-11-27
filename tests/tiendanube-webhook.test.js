import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  handleTiendanubePrivacyWebhook,
  verifyTiendanubeWebhookSignature,
} from '../src/lib/tiendanubeWebhookSecurity.js';

const SECRET = 'secreto-de-prueba';
const sign = (raw, secret = SECRET) => crypto.createHmac('sha256', secret).update(raw).digest('hex');

const noDb = {
  redactStore: () => assert.fail('No debe borrar'),
  redactCustomer: () => assert.fail('No debe anonimizar'),
  recordDataRequest: () => assert.fail('No debe registrar'),
};

test('la firma falla cerrada: sin secreto configurado se rechaza todo', () => {
  const raw = '{"store_id":1}';
  assert.equal(verifyTiendanubeWebhookSignature(raw, sign(raw), ''), false);
  assert.equal(verifyTiendanubeWebhookSignature(raw, '', SECRET), false);
  assert.equal(verifyTiendanubeWebhookSignature(raw, sign(raw, 'otro'), SECRET), false);
  assert.equal(verifyTiendanubeWebhookSignature(raw, sign(raw), SECRET), true);
});

test('privacidad: sin firma válida responde 401 y no toca la base', async () => {
  const raw = JSON.stringify({ store_id: 7570182 });
  const missingSecret = await handleTiendanubePrivacyWebhook({ topic: 'store-redact', rawBody: raw, signature: sign(raw), secret: '' }, noDb);
  assert.equal(missingSecret.status, 401);
  const badSignature = await handleTiendanubePrivacyWebhook({ topic: 'store-redact', rawBody: raw, signature: 'abc', secret: SECRET }, noDb);
  assert.equal(badSignature.status, 401);
});

test('store/redact borra los pedidos de esa tienda', async () => {
  const raw = JSON.stringify({ store_id: 123456 });
  const calls = [];
  const result = await handleTiendanubePrivacyWebhook({ topic: 'store-redact', rawBody: raw, signature: sign(raw), secret: SECRET }, {
    ...noDb,
    redactStore: async (args) => { calls.push(args); return { deleted: 4 }; },
  });
  assert.deepEqual(calls, [{ storeId: '123456' }]);
  assert.deepEqual(result, { status: 200, body: { received: true, redacted: 4 } });
});

test('customers/redact anonimiza por pedidos y email, y nunca loguea el cuerpo', async () => {
  const raw = JSON.stringify({
    store_id: 123456,
    event: 'customers/redact',
    customer: { id: 9, email: ' Cliente@Mail.com ', phone: '+54 11 5555', identification: '30111222' },
    orders_to_redact: [111, '222', 111, 'x'],
  });
  const calls = [];
  const logs = [];
  const result = await handleTiendanubePrivacyWebhook({ topic: 'customers-redact', rawBody: raw, signature: sign(raw), secret: SECRET }, {
    ...noDb,
    log: (...args) => logs.push(JSON.stringify(args)),
    redactCustomer: async (args) => { calls.push(args); return { anonymized: 2 }; },
  });
  assert.deepEqual(calls, [{ storeId: '123456', orderIds: ['111', '222'], email: 'cliente@mail.com' }]);
  assert.equal(result.body.redacted, 2);
  assert.ok(logs.length);
  for (const line of logs) assert.doesNotMatch(line, /mail\.com|5555|30111222/);
});

test('customers/data_request se registra sin borrar nada', async () => {
  const raw = JSON.stringify({ store_id: 123456, event: 'customers/data_request', customer: { id: 9 }, orders_requested: [5], data_request: { id: 77 } });
  const calls = [];
  const result = await handleTiendanubePrivacyWebhook({ topic: 'customers-data-request', rawBody: raw, signature: sign(raw), secret: SECRET }, {
    ...noDb,
    recordDataRequest: async (args) => { calls.push(args); },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(calls, [{ storeId: '123456', customerId: '9', requestId: '77', orderIds: ['5'] }]);
});

test('el webhook de pedidos usa la verificación compartida, que falla cerrada', () => {
  const source = readFileSync(new URL('../src/app/api/webhooks/tiendanube/route.js', import.meta.url), 'utf8');
  assert.match(source, /verifyTiendanubeWebhookSignature\(rawBody, signature, TIENDANUBE_CLIENT_SECRET\)/);
  assert.doesNotMatch(source, /if \(!TIENDANUBE_CLIENT_SECRET\) return true/);
});
