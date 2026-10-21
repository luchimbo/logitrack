import { verifyPublication } from './engine/publish-protocol.js';

export function authorizePublication({ request, rawBody, keysJson = process.env.CROSS_SELLING_PUBLISH_KEYS || '{}', now = Date.now() }) {
  const url = new URL(request.url), storeId = url.searchParams.get('storeId');
  if (!/^\d+$/.test(storeId || '')) return null;
  let keys;
  try { keys = JSON.parse(keysJson); } catch { return null; }
  if (!Object.hasOwn(keys, storeId)) return null;
  const valid = verifyPublication({ key: keys[storeId], method: request.method, path: url.pathname + url.search,
    timestamp: request.headers.get('x-mostrador-timestamp'), signature: request.headers.get('x-mostrador-signature'), body: rawBody, now });
  return valid ? storeId : null;
}
