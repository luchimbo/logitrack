import test from 'node:test';
import assert from 'node:assert/strict';
import { exportRedis } from '../src/lib/redisBackup.js';

test('exporta strings y hashes con TTL, recorre páginas y solo envía comandos de lectura', async () => {
  const sent = [];
  const fetchImpl = async (url, { body }) => {
    const commands = JSON.parse(body); sent.push(...commands);
    const result = commands.map(([cmd, a]) => ({ result:
      cmd === 'SCAN' ? (a === '0' ? ['7', ['acc:1', 'evt:1']] : ['0', ['zset:1']])
      : cmd === 'TYPE' ? ({ 'acc:1': 'hash', 'evt:1': 'string', 'zset:1': 'zset' })[a]
      : cmd === 'PTTL' ? 1000
      : cmd === 'HGETALL' ? ['sku', '1'] : 'v' }));
    return { ok: true, json: async () => result };
  };
  const out = await exportRedis({ url: 'http://r.test', token: 't', fetchImpl });
  assert.equal(out.count, 2);
  assert.deepEqual(out.unsupported, [{ key: 'zset:1', type: 'zset' }]);
  assert.deepEqual(out.entries.map(e => [e.key, e.value]), [['acc:1', ['sku', '1']], ['evt:1', 'v']]);
  assert.ok(sent.every(([cmd]) => ['SCAN', 'TYPE', 'PTTL', 'GET', 'HGETALL'].includes(cmd)));
});
