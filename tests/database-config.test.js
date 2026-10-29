import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseConfig, PCMIDI_DATABASE_URL } from '../src/lib/databaseConfig.js';

test('la base propia no recurre a credenciales antiguas de Turso', () => {
  assert.throws(() => databaseConfig({ TURSO_DATABASE_URL: 'libsql://old.turso.io', TURSO_AUTH_TOKEN: 'old' }), /Faltan DATABASE/);
  assert.throws(() => databaseConfig({ DATABASE_URL: 'libsql://old.turso.io', DATABASE_AUTH_TOKEN: 'old' }), /No se permite conectar a Turso/);
});
test('el portal exige su token RO incluso en desarrollo', () => {
  const env = { NODE_ENV: 'development', DATABASE_URL: PCMIDI_DATABASE_URL, DATABASE_AUTH_TOKEN: 'rw' };
  assert.throws(() => databaseConfig(env, { readOnly: true }), /DATABASE_READONLY_AUTH_TOKEN/);
  assert.equal(databaseConfig({ ...env, DATABASE_READONLY_AUTH_TOKEN: 'ro' }, { readOnly: true }).authToken, 'ro');
});
test('los scripts de producción siempre consultan PC MIDI', () => {
  assert.equal(databaseConfig({ DATABASE_AUTH_TOKEN: 'rw' }, { production: true }).url, PCMIDI_DATABASE_URL);
  assert.throws(() => databaseConfig({ DATABASE_URL_PROD: 'https://other.example', DATABASE_AUTH_TOKEN: 'rw' }, { production: true }), /debe ser el servicio HTTPS de PC MIDI/);
});
