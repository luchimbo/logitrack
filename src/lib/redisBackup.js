// Exporta (solo lectura) las claves de Upstash Redis por REST: SCAN + TYPE + PTTL + lectura.
// Soporta string y hash, los tipos usados por cross-selling. Otros tipos se informan, no se omiten en silencio.
export async function exportRedis({ url, token, fetchImpl = fetch, pageSize = 200 }) {
  const call = async (commands) => {
    const response = await fetchImpl(`${url.replace(/\/$/, '')}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(commands) });
    if (!response.ok) throw new Error(`Redis HTTP ${response.status}`);
    const results = await response.json();
    if (results.some(r => r.error)) throw new Error('Redis rechazó un comando de lectura');
    return results.map(r => r.result);
  };
  const entries = [], unsupported = [];
  let cursor = '0';
  do {
    const [[next, keys]] = await call([['SCAN', cursor, 'COUNT', String(pageSize)]]);
    cursor = String(next);
    if (!keys.length) continue;
    const types = await call(keys.map(k => ['TYPE', k]));
    const ttls = await call(keys.map(k => ['PTTL', k]));
    const readable = keys.map((k, i) => ({ key: k, type: types[i], ttlMs: ttls[i] }));
    const reads = await call(readable.filter(e => e.type === 'string' || e.type === 'hash').map(e => [e.type === 'string' ? 'GET' : 'HGETALL', e.key]));
    let n = 0;
    for (const e of readable) {
      if (e.type === 'string' || e.type === 'hash') entries.push({ ...e, value: reads[n++] });
      else unsupported.push({ key: e.key, type: e.type });
    }
  } while (cursor !== '0');
  return { exportedAt: new Date().toISOString(), count: entries.length, entries, unsupported };
}
