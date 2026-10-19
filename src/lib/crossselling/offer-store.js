// Aceptaciones y últimos carritos del callback en Upstash Redis (REST, sin dependencias).
// Está en el camino crítico del callback de TN (800 ms): una sola lectura con límite de tiempo.
import { ACCEPTANCE_TTL_MS } from './storefront-offer.js';

const TTL_SECONDS = Math.ceil(ACCEPTANCE_TTL_MS / 1000);
const digits = (v) => /^\d{1,30}$/.test(String(v ?? ''));

export function offerStoreConfig(env = process.env) {
  // El Marketplace de Vercel crea KV_REST_API_*; Upstash directo usa UPSTASH_REDIS_REST_*.
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

export function createOfferStore({ url, token, storeId, fetchImpl = fetch }) {
  const key = (kind, cartId) => {
    if (!digits(cartId)) throw new Error('Carrito inválido');
    return `cs:offer:${storeId}:${kind}:${cartId}`;
  };
  async function pipeline(commands, timeoutMs) {
    const response = await fetchImpl(`${url}/pipeline`, { method: 'POST', body: JSON.stringify(commands),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw Object.assign(new Error(`Redis HTTP ${response.status}`), { code: `REDIS_HTTP_${response.status}` });
    const results = await response.json();
    const failed = results.find((r) => r?.error);
    if (failed) throw Object.assign(new Error('Redis rechazó el comando'), { code: 'REDIS_COMMAND' });
    return results.map((r) => r.result);
  }
  const parse = (value) => { try { return JSON.parse(value); } catch { return null; } };

  // Aceptaciones vigentes del carrito: un hash por carrito, un campo por accesorio.
  async function acceptances(cartId, { timeoutMs = 300, now = Date.now() } = {}) {
    const [flat] = await pipeline([['HGETALL', key('acc', cartId)]], timeoutMs);
    const list = [];
    for (let i = 1; i < (flat || []).length; i += 2) {
      const a = parse(flat[i]);
      if (a && a.cartId === String(cartId) && a.expiresAt > now) list.push(a);
    }
    return list;
  }
  async function saveAcceptance(acceptance) {
    const k = key('acc', acceptance.cartId);
    await pipeline([['HSET', k, acceptance.accessoryVariant, JSON.stringify(acceptance)], ['EXPIRE', k, String(TTL_SECONDS)]], 3000);
  }
  // Último carrito que envió TN: valida las aceptaciones (no se confía en el navegador).
  async function saveEvent(cartId, event) {
    await pipeline([['SET', key('evt', cartId), JSON.stringify({ ...event, at: new Date().toISOString() }), 'EX', String(TTL_SECONDS)]], 3000);
  }
  async function lastEvent(cartId) {
    const [value] = await pipeline([['GET', key('evt', cartId)]], 3000);
    return value ? parse(value) : null;
  }
  return { acceptances, saveAcceptance, saveEvent, lastEvent };
}
