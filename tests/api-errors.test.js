import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/lib/api.js';
import { NETWORK_ERROR_MESSAGE, SERVER_ERROR_MESSAGE, SESSION_ERROR_MESSAGE, messageForStatus } from '../src/lib/apiErrors.js';

const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

const reply = (status, body) => async () => ({ ok: status < 400, status, json: async () => { if (body === undefined) throw new Error('sin cuerpo'); return body; } });

test('un fallo de red se traduce a un mensaje con instrucción', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(api('/x'), (error) => error.message === NETWORK_ERROR_MESSAGE && error.isNetworkError === true);
});

test('una cancelación no se disfraza de error de red', async () => {
  globalThis.fetch = async () => { const e = new Error('abort'); e.name = 'AbortError'; throw e; };
  await assert.rejects(api('/x'), (error) => error.name === 'AbortError');
});

test('401 pide volver a ingresar', async () => {
  globalThis.fetch = reply(401, { error: 'Unauthorized' });
  await assert.rejects(api('/x'), { message: SESSION_ERROR_MESSAGE });
});

test('cortes de pasarela no muestran mensajes técnicos', async () => {
  globalThis.fetch = reply(504, undefined);
  await assert.rejects(api('/x'), { message: SERVER_ERROR_MESSAGE });
});

test('los errores de validación conservan el mensaje del servidor', async () => {
  globalThis.fetch = reply(400, { error: 'Período inválido' });
  await assert.rejects(api('/x'), { message: 'Período inválido' });
  assert.equal(messageForStatus(500, 'No pudimos cargar transportistas'), 'No pudimos cargar transportistas');
  assert.equal(messageForStatus(500, undefined), SERVER_ERROR_MESSAGE);
});

test('una respuesta correcta se devuelve tal cual', async () => {
  globalThis.fetch = reply(200, { ok: true });
  assert.deepEqual(await api('/x'), { ok: true });
});
