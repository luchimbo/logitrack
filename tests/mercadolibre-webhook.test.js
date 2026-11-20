import test from 'node:test';
import assert from 'node:assert/strict';
import { receiveMercadoLibreNotification } from '../src/lib/mercadolibreWebhook.js';

const event = { topic: 'shipments', resource: '/shipments/48574234168', user_id: 123, application_id: 456 };
const request = (body = event) => new Request('https://example.test/webhook', { method: 'POST', body: JSON.stringify(body) });

test('confirma el aviso persistido sin esperar la consulta a Mercado Libre', async () => {
  const calls = [];
  const background = [];
  let allowPersist;
  const stored = new Promise((resolve) => { allowPersist = resolve; });
  const response = receiveMercadoLibreNotification(request(), {
    applicationId: '456',
    persist: ({ topic, resource, userId, applicationId }) => {
      calls.push('guardar');
      assert.deepEqual({ topic, resource, userId, applicationId }, {
        topic: 'shipments', resource: '/shipments/48574234168', userId: '123', applicationId: '456',
      });
      return stored;
    },
    defer: (callback) => background.push(callback),
    process: async (row) => { calls.push(row.id); },
  });
  assert.equal(background.length, 0);
  allowPersist(10n);
  assert.deepEqual(await response, { status: 200, body: { received: true, queued: true } });
  assert.deepEqual(calls, ['guardar']);
  assert.equal(background.length, 1);
  await background[0]();
  assert.deepEqual(calls, ['guardar', 10n]);
});

test('rechaza otra aplicación y devuelve 503 si falla la escritura, sin ejecutar el trabajo', async () => {
  let writes = 0;
  const handlers = {
    applicationId: '456',
    persist: async () => { writes++; throw Object.assign(new Error('database unavailable'), { code: 'BLOCKED' }); },
    defer: () => assert.fail('No programar un aviso no guardado'),
    process: () => assert.fail('No procesar un aviso no guardado'),
  };
  assert.equal((await receiveMercadoLibreNotification(request({ ...event, application_id: 111 }), handlers)).status, 403);
  assert.equal(writes, 0);
  assert.deepEqual(await receiveMercadoLibreNotification(request(), handlers), {
    status: 503, body: { received: false, error: 'No se pudo guardar el aviso' },
  });
  assert.equal(writes, 1);
});
