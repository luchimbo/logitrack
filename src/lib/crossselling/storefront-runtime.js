import { db } from '@/lib/db';
import { createTiendanubeClient } from '@/lib/tiendanubeClient';
import { mapOnlineCatalog, PROMOTION_COMBINATION } from './engine/online-crossselling.js';
import { createCrossSellingRepository } from './repository.js';
import { lookupCrossSellingConnection } from './runtime.js';
import { DEMO_STORE_ID } from './demo-probe-commands.js';
import { addAcceptance, buildAcceptance, createOfferSigner, storefrontOffers } from './storefront-offer.js';
import { createOfferStore, offerStoreConfig } from './offer-store.js';
import { isStorefrontStore } from './stores.js';

const NAME = 'LogiTrack · Completá tu equipo';
const failure = (message, status = 409) => Object.assign(new Error(message), { status });
const repository = createCrossSellingRepository(db);
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
  ], 'write').catch((e) => { initialized = null; throw e; }));
}
async function readState(storeId) {
  await init();
  const { rows } = await db.execute({ sql: 'SELECT * FROM crossselling_offer_state WHERE store_id=?', args: [storeId] });
  return rows[0] ? { workspaceId: Number(rows[0].workspace_id), ...JSON.parse(rows[0].state_json), storeId } : null;
}
async function saveState(storeId, state) {
  await init();
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

// La configuración publicada cambia poco: evitar leerla en cada vista de la tienda.
const publications = new Map();
async function publication(storeId) {
  const cached = publications.get(storeId);
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  const record = await repository.get(storeId);
  if (!record) throw failure('Mostrador todavía no publicó reglas para esta tienda');
  const value = { record, catalog: mapOnlineCatalog(record.snapshot, record.catalog) };
  publications.set(storeId, { at: Date.now(), value });
  return value;
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

async function enabledState(storeId) {
  const state = await readState(storeId);
  if (!state?.enabled || !state.promotionId) throw failure('El módulo no está activo', 404);
  return state;
}

export async function offersForStorefront(storeId, items) {
  storeId = allowed(storeId);
  await enabledState(storeId);
  const { record, catalog } = await publication(storeId);
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
