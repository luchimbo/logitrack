import { db } from '@/lib/db';
import { createTiendanubeClient } from '@/lib/tiendanubeClient';
import { mapOnlineCatalog, PROMOTION_COMBINATION } from './engine/online-crossselling.js';
import { createCrossSellingRepository } from './repository.js';
import { lookupCrossSellingConnection } from './runtime.js';
import { DEMO_STORE_ID } from './demo-probe-commands.js';
import { addAcceptance, buildAcceptance, createOfferSigner, storefrontOffers } from './storefront-offer.js';
import { createOfferStore, offerStoreConfig } from './offer-store.js';
import { isStorefrontStore } from './stores.js';
import { attributeOrder, dayAR, daysBetween, orderSummary, sumDailyCounters } from './online-sales.js';
import { round2 } from './engine/pricing.js';
import { createOnlineOrderRepository } from './order-repository.js';
import { createOrderReconciler } from './order-reconciliation.js';

const NAME = 'LogiTrack · Completá tu equipo';
const failure = (message, status = 409) => Object.assign(new Error(message), { status });
const repository = createCrossSellingRepository(db);
const orderRepository = createOnlineOrderRepository(db);
const signer = (storeId) => createOfferSigner(process.env.ZIPNOVA_ENCRYPTION_KEY, storeId);
const allowed = (storeId) => {
  if (!isStorefrontStore(storeId)) throw failure('Tienda no habilitada para el módulo', 404);
  return String(storeId);
};

let initialized;
async function init() {
  await (initialized ||= db.batch([
    'CREATE TABLE IF NOT EXISTS crossselling_offer_state (store_id TEXT PRIMARY KEY, workspace_id INTEGER NOT NULL, state_json TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS crossselling_offer_events (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, cart_id TEXT NOT NULL, event_json TEXT NOT NULL)',
    'CREATE INDEX IF NOT EXISTS crossselling_offer_events_cart ON crossselling_offer_events(cart_id, id)',
    // Informe online: aceptaciones, pedidos de la tienda y accesorios atribuidos.
    `CREATE TABLE IF NOT EXISTS crossselling_acceptances (id INTEGER PRIMARY KEY AUTOINCREMENT, store_id TEXT NOT NULL,
      cart_id TEXT NOT NULL, rule_id TEXT NOT NULL, accessory_variant TEXT NOT NULL, trigger_variant TEXT NOT NULL,
      pct REAL NOT NULL, accepted_at TEXT NOT NULL)`,
    'CREATE INDEX IF NOT EXISTS crossselling_acceptances_lookup ON crossselling_acceptances(store_id, accessory_variant, accepted_at)',
  ], 'write').then(() => orderRepository.init()).catch((e) => { initialized = null; throw e; }));
}
// Las vistas de la tienda leen el estado de memoria hasta 15 s; los cambios del interruptor
// llegan a las demás instancias en ese plazo. Las acciones de administración leen siempre la base.
const STATE_TTL_MS = 15_000;
const stateCache = new Map();
async function cachedState(storeId) {
  const hit = stateCache.get(storeId);
  if (hit && Date.now() - hit.at < STATE_TTL_MS) return hit.value;
  const value = await readState(storeId);
  stateCache.set(storeId, { at: Date.now(), value });
  return value;
}
async function readState(storeId) {
  await init();
  const { rows } = await db.execute({ sql: 'SELECT * FROM crossselling_offer_state WHERE store_id=?', args: [storeId] });
  return rows[0] ? { workspaceId: Number(rows[0].workspace_id), ...JSON.parse(rows[0].state_json), storeId } : null;
}
async function saveState(storeId, state) {
  await init();
  stateCache.delete(storeId);
  const { storeId: _omit, ...data } = state;
  await db.execute({ sql: `INSERT INTO crossselling_offer_state VALUES(?,?,?) ON CONFLICT(store_id) DO UPDATE SET state_json=excluded.state_json
    WHERE crossselling_offer_state.workspace_id=excluded.workspace_id`, args: [storeId, state.workspaceId, JSON.stringify(data)] });
}

// Con Redis configurado, la URL del callback es fija y las aceptaciones viven en Redis.
// Sin Redis, viajan en la URL firmada (máximo 3, sólo para pruebas).
const storeConfig = offerStoreConfig();
export const acceptanceMode = storeConfig ? 'redis' : 'url';
const offerStores = new Map();
function offerStoreFor(storeId) {
  if (!storeConfig) return null;
  if (!offerStores.has(storeId)) offerStores.set(storeId, createOfferStore({ ...storeConfig, storeId }));
  return offerStores.get(storeId);
}
const callbackUrl = (storeId, state) => signer(storeId).encode({ promotionId: state.promotionId,
  acceptances: state.enabled && !storeConfig ? state.acceptances || [] : [] }).url;

// Aceptaciones para el callback: las de la URL (modo anterior) más las de Redis.
export async function callbackAcceptances(state, cartId) {
  const store = offerStoreFor(state.storeId);
  if (!store) return state.acceptances;
  return [...state.acceptances, ...await store.acceptances(String(cartId))];
}

// La configuración publicada cambia poco y es grande (catálogo de TN): se sirve de memoria y,
// pasado un minuto, se renueva en segundo plano sin hacer esperar a la tienda.
const PUBLICATION_FRESH_MS = 60_000;
const PUBLICATION_MAX_STALE_MS = 30 * 60_000;
const publications = new Map();
async function loadPublication(storeId) {
  const record = await repository.get(storeId);
  if (!record) throw failure('Mostrador todavía no publicó reglas para esta tienda');
  const value = { record, catalog: mapOnlineCatalog(record.snapshot, record.catalog) };
  publications.set(storeId, { at: Date.now(), value });
  return value;
}
async function publication(storeId) {
  const cached = publications.get(storeId);
  const age = cached ? Date.now() - cached.at : Infinity;
  if (age < PUBLICATION_FRESH_MS) return cached.value;
  if (age < PUBLICATION_MAX_STALE_MS) {
    if (!cached.refreshing) {
      cached.refreshing = true;
      loadPublication(storeId).catch(() => { cached.refreshing = false; });
    }
    return cached.value;
  }
  return loadPublication(storeId);
}

// Cliente de la tienda con la conexión de Logitrack; exige que pertenezca al espacio.
async function storeClient(storeId, workspaceId) {
  const connection = await lookupCrossSellingConnection(storeId);
  if (!connection?.config?.accessToken || String(connection.config.storeId) !== storeId) throw failure('La tienda no está conectada a Logitrack');
  if (workspaceId != null && Number(connection.workspaceId) !== Number(workspaceId)) throw failure('La tienda no está vinculada a este espacio');
  return createTiendanubeClient({ storeId, accessToken: connection.config.accessToken });
}

export async function offerStatus(workspaceId, storeId = DEMO_STORE_ID) {
  storeId = allowed(storeId);
  const state = await readState(storeId);
  if (state && state.workspaceId !== workspaceId) throw failure('El módulo pertenece a otro espacio');
  const client = await storeClient(storeId, workspaceId);
  await init();
  const [promotions, scripts, record, events] = await Promise.all([
    state?.promotionId ? client.listPromotions().then((list) => list.filter((p) => String(p.id) === state.promotionId)) : [],
    client.listScripts().catch((e) => ({ error: `No se pudieron consultar los scripts (HTTP ${e.status || '?'})` })),
    repository.get(storeId),
    // Los eventos anteriores a varias tiendas no guardaban storeId: son de la demo.
    db.execute({ sql: `SELECT created_at,cart_id,event_json FROM crossselling_offer_events
      WHERE COALESCE(json_extract(event_json,'$.storeId'),?)=? ORDER BY id DESC LIMIT 12`, args: [DEMO_STORE_ID, storeId] }),
  ]);
  return { storeId, acceptanceMode, state, promotions, scripts,
    publication: record ? { revision: record.revision, publishedAt: record.publishedAt, requestedEnabled: record.snapshot.enabled,
      selectedRules: record.snapshot.ruleIds.length, mappedProducts: record.diagnostics?.mappedProducts ?? null } : null,
    events: events.rows.map((r) => ({ at: r.created_at, cartId: r.cart_id, ...JSON.parse(r.event_json) })) };
}

export async function changeOffer(workspaceId, input, storeId = DEMO_STORE_ID) {
  storeId = allowed(storeId);
  const client = await storeClient(storeId, workspaceId);
  const store = await client.getStore();
  if (String(store.id) !== storeId) throw failure('La conexión devolvió una tienda distinta');
  let state = await readState(storeId);
  if (state && state.workspaceId !== workspaceId) throw failure('El módulo pertenece a otro espacio');
  if (input.action === 'enable') {
    const record = await repository.get(storeId);
    if (!record || record.workspaceId !== workspaceId) throw failure('Primero publicá las reglas desde Mostrador');
    if (!record.snapshot.enabled || !record.snapshot.ruleIds.length) throw failure('En Mostrador, activá al menos una regla de Recomendaciones y volvé a publicar');
    if (!state?.promotionId) {
      const existing = (await client.listPromotions()).find((p) => p.name === NAME);
      const created = existing || await client.createPromotion({ name: NAME, ...PROMOTION_COMBINATION });
      const promotionId = String(created?.data?.id || created?.id || '');
      if (!promotionId) throw failure('Tiendanube no devolvió el ID de promoción', 502);
      state = { workspaceId, promotionId, acceptances: [] };
    }
    // El callback de descuentos es único por tienda: reemplaza a cualquier otro de la app.
    state = { ...state, enabled: true };
    await saveState(storeId, state);
    await client.setDiscountCallback(callbackUrl(storeId, state));
    await client.updatePromotion(state.promotionId, { active: true });
  } else if (input.action === 'disable') {
    if (state) {
      state = { ...state, enabled: false, acceptances: [] };
      await saveState(storeId, state);
      await client.setDiscountCallback(callbackUrl(storeId, state));
      await client.updatePromotion(state.promotionId, { active: false });
    }
  } else if (input.action === 'install-script') {
    const scriptId = Number(input.scriptId);
    if (!Number.isInteger(scriptId) || scriptId <= 0) throw failure('Indicá el ID del script creado en Partners');
    // La lista de TN incluye los scripts de la app aunque no estén asociados a la tienda:
    // pedir siempre la asociación y tolerar sólo la respuesta de «ya existe».
    await client.createScriptAssociation(scriptId).catch((e) => { if (![409, 422].includes(e.status)) throw e; });
  } else if (input.action === 'uninstall-script') {
    const scriptId = Number(input.scriptId);
    if (!Number.isInteger(scriptId) || scriptId <= 0) throw failure('Indicá el ID del script creado en Partners');
    await client.deleteScriptAssociation(scriptId).catch((e) => { if (e.status !== 404) throw e; });
  } else throw failure('Acción inválida', 400);
  return offerStatus(workspaceId, storeId);
}

async function enabledState(storeId, { cached = false } = {}) {
  const state = await (cached ? cachedState(storeId) : readState(storeId));
  if (!state?.enabled || !state.promotionId) throw failure('El módulo no está activo', 404);
  return state;
}

export async function offersForStorefront(storeId, items) {
  storeId = allowed(storeId);
  // Estado y publicación en paralelo, desde memoria cuando ya están cargados.
  const [, { record, catalog }] = await Promise.all([enabledState(storeId, { cached: true }), publication(storeId)]);
  return storefrontOffers(record.snapshot, catalog, items, record.catalog);
}

async function latestCallbackCart(storeId, cartId) {
  // El callback guarda el carrito después de responder: esperar unos segundos.
  const store = offerStoreFor(storeId);
  for (let attempt = 0; attempt < 4; attempt++) {
    if (store) {
      const event = await store.lastEvent(cartId);
      if (event) return event;
    } else {
      const { rows } = await db.execute({ sql: 'SELECT created_at,event_json FROM crossselling_offer_events WHERE cart_id=? ORDER BY id DESC LIMIT 1', args: [cartId] });
      if (rows[0] && Date.now() - Date.parse(rows[0].created_at) < 2 * 60 * 60_000) return JSON.parse(rows[0].event_json);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}

export async function acceptOffer(storeId, { cartId, triggerLineId, accessoryVariant }) {
  storeId = allowed(storeId);
  let state = await enabledState(storeId);
  await init();
  const { record, catalog } = await publication(storeId);
  const callbackCart = await latestCallbackCart(storeId, String(cartId));
  if (!callbackCart || (callbackCart.storeId && callbackCart.storeId !== storeId)) throw failure('Tiendanube todavía no confirmó este carrito. Volvé a intentar en unos segundos.');
  const acceptance = buildAcceptance({ snapshot: record.snapshot, catalog, callbackCart, cartId, triggerLineId, accessoryVariant });
  await recordAcceptance(storeId, acceptance).catch((e) => console.warn('Cross-selling acceptance log failed', e.name));
  const store = offerStoreFor(storeId);
  if (store) {
    // La URL del callback no cambia: el próximo cálculo del carrito ya ve la aceptación.
    await store.saveAcceptance(acceptance);
    return { accepted: true, mode: 'redis', pct: acceptance.pct, expiresAt: new Date(acceptance.expiresAt).toISOString() };
  }
  state = { ...state, acceptances: addAcceptance(state.acceptances, acceptance) };
  await saveState(storeId, state);
  await (await storeClient(storeId, state.workspaceId)).setDiscountCallback(callbackUrl(storeId, state));
  return { accepted: true, mode: 'url', pct: acceptance.pct, expiresAt: new Date(acceptance.expiresAt).toISOString() };
}

export function verifiedOfferState(storeId, token, encoded) {
  return isStorefrontStore(storeId) ? signer(String(storeId)).verify(token, encoded) : null;
}

export async function recordOfferEvent(cart, commands, elapsedMs) {
  // Sólo lo necesario para validar aceptaciones: sin cliente, dirección ni pagos.
  const storeId = String(cart.store_id);
  if (!isStorefrontStore(storeId) || !/^\d{1,30}$/.test(String(cart.cart_id))) return;
  await init();
  const event = { storeId, elapsedMs, tier: cart.execution_tier, currency: cart.currency, coupons: (cart.coupons || []).length,
    products: (cart.products || []).slice(0, 40).map((p) => ({ id: p.id, variantId: p.variant_id, quantity: p.quantity, price: p.price })),
    commands: commands.map((c) => c.command) };
  await Promise.all([offerStoreFor(storeId)?.saveEvent(String(cart.cart_id), event), db.batch([
    { sql: 'INSERT INTO crossselling_offer_events(created_at,cart_id,event_json) VALUES(?,?,?)', args: [new Date().toISOString(), String(cart.cart_id), JSON.stringify(event)] },
    'DELETE FROM crossselling_offer_events WHERE id <= (SELECT MAX(id)-500 FROM crossselling_offer_events)',
  ], 'write')]);
}

// ---------- Informe online ----------

async function recordAcceptance(storeId, a) {
  await db.execute({ sql: `INSERT INTO crossselling_acceptances(store_id,cart_id,rule_id,accessory_variant,trigger_variant,pct,accepted_at)
    VALUES(?,?,?,?,?,?,?)`, args: [storeId, a.cartId, a.ruleId || '', a.accessoryVariant, a.triggerVariant, a.pct, new Date().toISOString()] });
  await offerStoreFor(storeId)?.countStats(dayAR(Date.now()), { [`accepted:${a.ruleId || ''}`]: 1 });
}

// Vistas de ofertas informadas por la tienda (una por bloque y página).
export async function recordSeen(storeId, ruleIds) {
  storeId = allowed(storeId);
  const fields = {};
  for (const id of ruleIds) fields[`shown:${id}`] = (fields[`shown:${id}`] || 0) + 1;
  await offerStoreFor(storeId)?.countStats(dayAR(Date.now()), fields);
}

// Webhook de pedidos: guarda el pedido y los accesorios atribuidos a ofertas aceptadas.
export async function recordOnlineOrder(storeId, order) {
  if (!isStorefrontStore(storeId) || !order?.id) return;
  storeId = String(storeId);
  await init();
  const summary = orderSummary(order);
  const state = await readState(storeId);
  const from = new Date(new Date(summary.createdAt).getTime() - 6 * 60 * 60_000).toISOString();
  const until = new Date(new Date(summary.createdAt).getTime() + 10 * 60_000).toISOString();
  const { rows } = await db.execute({ sql: `SELECT rule_id, accessory_variant, trigger_variant, pct, accepted_at
    FROM crossselling_acceptances WHERE store_id=? AND accepted_at>=? AND accepted_at<=? ORDER BY id DESC`, args: [storeId, from, until] });
  const acceptances = rows.map((r) => ({ ruleId: r.rule_id, accessoryVariant: r.accessory_variant, triggerVariant: r.trigger_variant,
    pct: Number(r.pct), acceptedAt: r.accepted_at }));
  const sales = attributeOrder({ order, acceptances, promotionId: state?.promotionId });
  const sourceUpdatedAt = new Date(order.updated_at || order.created_at).toISOString();
  return orderRepository.save(storeId, summary, sales, sourceUpdatedAt);
}

const reconcileOrders = createOrderReconciler({ repository: orderRepository,
  clientFor: (storeId) => storeClient(storeId), record: recordOnlineOrder });

// Informe por creación (Argentina). Sólo pagos recibidos y no cancelados.
// Conciliar antes de leer evita presentar un reporte incompleto como actualizado.
export async function onlineReport(storeId, { from, to }) {
  storeId = allowed(storeId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '') || from > to) throw failure('Período inválido', 400);
  await init();
  const reconciliation = await reconcileOrders(storeId);
  const start = new Date(`${from}T03:00:00.000Z`).toISOString();
  const endDate = new Date(`${to}T03:00:00.000Z`); endDate.setUTCDate(endDate.getUTCDate() + 1);
  const end = endDate.toISOString();
  const valid = 'o.store_id=? AND o.paid=1 AND o.cancelled=0 AND o.created_at>=? AND o.created_at<?';
  const args = [storeId, start, end];
  const [orders, withCs, byRule, byProduct, counters] = await Promise.all([
    db.execute({ sql: `SELECT COUNT(*) AS n, COALESCE(SUM(o.total),0) AS total FROM crossselling_online_orders o WHERE ${valid}`, args }),
    db.execute({ sql: `SELECT COUNT(DISTINCT s.order_id) AS n, COALESCE(SUM(s.revenue),0) AS revenue, COALESCE(SUM(s.discount),0) AS discount
      FROM crossselling_online_sales s JOIN crossselling_online_orders o ON o.store_id=s.store_id AND o.order_id=s.order_id WHERE ${valid}`, args }),
    db.execute({ sql: `SELECT s.rule_id, COUNT(*) AS n, COALESCE(SUM(s.revenue),0) AS revenue
      FROM crossselling_online_sales s JOIN crossselling_online_orders o ON o.store_id=s.store_id AND o.order_id=s.order_id WHERE ${valid} GROUP BY s.rule_id`, args }),
    db.execute({ sql: `SELECT s.product_name, COUNT(*) AS n, COALESCE(SUM(s.quantity),0) AS units, COALESCE(SUM(s.revenue),0) AS revenue
      FROM crossselling_online_sales s JOIN crossselling_online_orders o ON o.store_id=s.store_id AND o.order_id=s.order_id WHERE ${valid}
      GROUP BY s.product_name ORDER BY revenue DESC LIMIT 30`, args }),
    offerStoreFor(storeId) ? offerStoreFor(storeId).readStats(daysBetween(from, to)).then(sumDailyCounters).catch(() => ({})) : {},
  ]);
  const rules = {};
  for (const [ruleId, c] of Object.entries(counters)) rules[ruleId] = { shown: c.shown, accepted: c.accepted, sold: 0, revenue: 0 };
  for (const r of byRule.rows) {
    rules[r.rule_id] ||= { shown: 0, accepted: 0, sold: 0, revenue: 0 };
    rules[r.rule_id].sold = Number(r.n); rules[r.rule_id].revenue = round2(Number(r.revenue));
  }
  return { storeId, from, to, dateBasis: 'created_at', reconciliation, orders: Number(orders.rows[0].n), total: round2(Number(orders.rows[0].total)),
    ordersWithCrossSelling: Number(withCs.rows[0].n), crossSellingRevenue: round2(Number(withCs.rows[0].revenue)),
    crossSellingDiscount: round2(Number(withCs.rows[0].discount)), countersAvailable: Boolean(offerStoreFor(storeId)), rules,
    products: byProduct.rows.map((r) => ({ name: r.product_name, sales: Number(r.n), units: Number(r.units), revenue: round2(Number(r.revenue)) })) };
}
