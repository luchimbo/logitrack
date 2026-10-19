import { db } from '@/lib/db';
import { getIntegration, listIntegrationConnections } from '@/lib/integrationService';
import { createTiendanubeClient } from '@/lib/tiendanubeClient';
import { DEMO_STORE_ID, demoProbeCommands } from './demo-probe-commands.js';
import { createDemoProbeSigner } from './demo-probe-signing.js';

const NAME = 'LogiTrack · prueba cross-selling $1';
let initialized;
async function init() {
  await (initialized ||= db.batch([
    'CREATE TABLE IF NOT EXISTS crossselling_demo_probe (store_id TEXT PRIMARY KEY, workspace_id INTEGER NOT NULL, state_json TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS crossselling_demo_probe_events (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, cart_id TEXT NOT NULL, event_json TEXT NOT NULL)',
  ], 'write').catch((e) => { initialized = null; throw e; }));
}
async function read() {
  await init();
  const { rows } = await db.execute({ sql: 'SELECT * FROM crossselling_demo_probe WHERE store_id=?', args: [DEMO_STORE_ID] });
  return rows[0] ? { workspaceId: Number(rows[0].workspace_id), ...JSON.parse(rows[0].state_json) } : null;
}
async function save(state) {
  await init();
  await db.execute({ sql: 'INSERT INTO crossselling_demo_probe VALUES(?,?,?) ON CONFLICT(store_id) DO UPDATE SET state_json=excluded.state_json WHERE workspace_id=excluded.workspace_id',
    args: [DEMO_STORE_ID, state.workspaceId, JSON.stringify(state)] });
}
export async function clientForWorkspace(workspaceId) {
  const connections = await listIntegrationConnections({ workspaceId, provider: 'tiendanube', includeConfig: true });
  let c = connections.find((c) => String(c.externalStoreId) === DEMO_STORE_ID && String(c.config?.storeId) === DEMO_STORE_ID);
  if (!c) c = await getIntegration({ workspaceId, provider: 'tiendanube' });
  if (String(c?.config?.storeId) !== DEMO_STORE_ID || !c?.config?.accessToken) throw new Error('La demo no está vinculada a este espacio');
  return createTiendanubeClient({ storeId: DEMO_STORE_ID, accessToken: c.config.accessToken });
}
function signedCallbackUrl(state) {
  const { token, encoded } = createDemoProbeSigner(process.env.ZIPNOVA_ENCRYPTION_KEY).encode(state);
  return `https://www.geomodi.ai/api/cross-selling/demo-callback/${token}?state=${encoded}`;
}
export function verifiedProbeState(token, encoded) {
  return createDemoProbeSigner(process.env.ZIPNOVA_ENCRYPTION_KEY).verify(token, encoded);
}
export async function probeStatus(workspaceId) {
  const state = await read();
  if (state && state.workspaceId !== workspaceId) throw new Error('La prueba pertenece a otro espacio');
  const { rows } = await db.execute('SELECT created_at,cart_id,event_json FROM crossselling_demo_probe_events ORDER BY id DESC LIMIT 12');
  const promotions = state?.promotionId ? (await (await clientForWorkspace(workspaceId)).listPromotions()).filter((p) => String(p.id) === state.promotionId) : [];
  return { storeId: DEMO_STORE_ID, state, promotions, events: rows.map((r) => ({ at: r.created_at, cartId: r.cart_id, ...JSON.parse(r.event_json) })) };
}
export async function changeProbe(workspaceId, input) {
  const client = await clientForWorkspace(workspaceId);
  const store = await client.getStore();
  if (String(store.id) !== DEMO_STORE_ID || store.original_domain !== 'logitrackprueba.mitiendanube.com') throw new Error('Esta operación admite sólo LogiTrack Prueba');
  let state = await read();
  if (state && state.workspaceId !== workspaceId) throw new Error('La prueba pertenece a otro espacio');
  if (input.action === 'prepare') {
    const products = await client.downloadCatalog();
    const choices = products.filter((p) => p.published).flatMap((p) => (p.variants || [])
      .filter((v) => Number(v.price) > 1 && (v.stock_management === false || Number(v.stock) > 0))
      .map((v) => ({ productId: String(p.id), variantId: String(v.id), name: p.name?.es || String(p.id), price: v.promotional_price || v.price })));
    if (new Set(choices.map((c) => c.productId)).size < 2) throw new Error('Se necesitan dos productos publicados con stock en la demo');
    if (!state?.promotionId) {
      const existing = (await client.listPromotions()).find((p) => p.name === NAME);
      const created = existing || await client.createPromotion({ name: NAME, allocation_type: 'line_item', active: false,
        combines_with_quantity_discounts: false, combines_with_free_shipping: true, combines_with_cart_amount_discounts: true,
        combines_with_app_discounts: false, combines_with_price_discounts: true });
      const promotionId = String(created?.data?.id || created?.id || '');
      if (!promotionId) throw new Error('Tiendanube no devolvió el ID de promoción');
      state = { workspaceId, promotionId };
    }
    state = { ...state, choices, enabled: false, cartId: '', expiresAt: Date.now() + 2 * 60 * 60_000 };
    await save(state);
    await client.setDiscountCallback(signedCallbackUrl(state));
    await client.updatePromotion(state.promotionId, { active: true });
  } else if (input.action === 'accept') {
    if (!state?.promotionId || state.expiresAt <= Date.now()) throw new Error('Primero prepará la prueba');
    const trigger = state.choices.find((c) => c.variantId === String(input.triggerVariant));
    const accessory = state.choices.find((c) => c.variantId === String(input.accessoryVariant));
    if (!trigger || !accessory || trigger.productId === accessory.productId) throw new Error('Elegí dos productos distintos');
    if (!/^\d{1,30}$/.test(String(input.cartId))) throw new Error('Indicá el carrito recibido de Tiendanube');
    const event = await db.execute({ sql: 'SELECT id FROM crossselling_demo_probe_events WHERE cart_id=? LIMIT 1', args: [String(input.cartId)] });
    if (!event.rows.length) throw new Error('El carrito todavía no fue confirmado por el callback');
    state = { ...state, enabled: true, cartId: String(input.cartId), triggerVariant: trigger.variantId, accessoryVariant: accessory.variantId };
    await save(state);
    await client.setDiscountCallback(signedCallbackUrl(state));
  } else if (input.action === 'revoke' || input.action === 'disable') {
    if (state) { state = { ...state, enabled: false }; await save(state); await client.setDiscountCallback(signedCallbackUrl(state)); }
    if (state?.promotionId && input.action === 'disable') await client.updatePromotion(state.promotionId, { active: false });
  } else throw new Error('Acción inválida');
  return probeStatus(workspaceId);
}
// La sonda usa claims firmados y limitados a UN carrito, con vencimiento.
// Esto permite verificar la API de TN sin confundir su prueba con la arquitectura
// de aceptaciones comerciales, que requiere almacenamiento de baja latencia.
export function evaluateProbe(state, cart) { return demoProbeCommands(state, cart); }
export async function recordProbeEvent(cart, commands, elapsedMs) {
  // Persistir sólo datos de la prueba, sin cliente, dirección ni medios de pago.
  if (String(cart.store_id) === DEMO_STORE_ID && /^\d{1,30}$/.test(String(cart.cart_id))) {
    const event = { elapsedMs, region: process.env.VERCEL_REGION || null, tier: cart.execution_tier, currency: cart.currency, products: (cart.products || []).slice(0, 40)
      .map((p) => ({ id: p.id, variantId: p.variant_id, quantity: p.quantity, price: p.price })), commands,
      promotions: (cart.promotions || []).map((p) => ({ id: p.id, lineItems: p.line_items })) };
    await db.batch([
      { sql: 'INSERT INTO crossselling_demo_probe_events(created_at,cart_id,event_json) VALUES(?,?,?)', args: [new Date().toISOString(), String(cart.cart_id), JSON.stringify(event)] },
      'DELETE FROM crossselling_demo_probe_events WHERE id <= (SELECT MAX(id)-100 FROM crossselling_demo_probe_events)',
    ], 'write');
  }
}
