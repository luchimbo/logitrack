import { db } from '@/lib/db';
import { mapOnlineCatalog, PROMOTION_COMBINATION } from './engine/online-crossselling.js';
import { createCrossSellingRepository } from './repository.js';
import { clientForWorkspace } from './demo-probe.js';
import { DEMO_STORE_ID } from './demo-probe-commands.js';
import { addAcceptance, buildAcceptance, createOfferSigner, storefrontOffers } from './storefront-offer.js';

const NAME = 'LogiTrack · Completá tu equipo';
const DEMO_DOMAIN = 'logitrackprueba.mitiendanube.com';
export const STOREFRONT_ORIGIN = `https://${DEMO_DOMAIN}`;
const failure = (message, status = 409) => Object.assign(new Error(message), { status });
const repository = createCrossSellingRepository(db);
const signer = () => createOfferSigner(process.env.ZIPNOVA_ENCRYPTION_KEY);

let initialized;
async function init() {
  await (initialized ||= db.batch([
    'CREATE TABLE IF NOT EXISTS crossselling_offer_state (store_id TEXT PRIMARY KEY, workspace_id INTEGER NOT NULL, state_json TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS crossselling_offer_events (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, cart_id TEXT NOT NULL, event_json TEXT NOT NULL)',
    'CREATE INDEX IF NOT EXISTS crossselling_offer_events_cart ON crossselling_offer_events(cart_id, id)',
  ], 'write').catch((e) => { initialized = null; throw e; }));
}
async function readState() {
  await init();
  const { rows } = await db.execute({ sql: 'SELECT * FROM crossselling_offer_state WHERE store_id=?', args: [DEMO_STORE_ID] });
  return rows[0] ? { workspaceId: Number(rows[0].workspace_id), ...JSON.parse(rows[0].state_json) } : null;
}
async function saveState(state) {
  await init();
  await db.execute({ sql: `INSERT INTO crossselling_offer_state VALUES(?,?,?) ON CONFLICT(store_id) DO UPDATE SET state_json=excluded.state_json
    WHERE crossselling_offer_state.workspace_id=excluded.workspace_id`, args: [DEMO_STORE_ID, state.workspaceId, JSON.stringify(state)] });
}
const callbackUrl = (state) => signer().encode({ promotionId: state.promotionId, acceptances: state.enabled ? state.acceptances : [] }).url;

// La configuración publicada cambia poco: evitar leerla en cada vista de la tienda.
let cache = { at: 0, value: null };
async function publication() {
  if (cache.value && Date.now() - cache.at < 60_000) return cache.value;
  const record = await repository.get(DEMO_STORE_ID);
  if (!record) throw failure('Mostrador todavía no publicó reglas para la demo');
  const value = { record, catalog: mapOnlineCatalog(record.snapshot, record.catalog) };
  cache = { at: Date.now(), value };
  return value;
}

async function demoClient(workspaceId) {
  const client = await clientForWorkspace(workspaceId);
  const store = await client.getStore();
  if (String(store.id) !== DEMO_STORE_ID || store.original_domain !== DEMO_DOMAIN) throw failure('Esta operación admite sólo LogiTrack Prueba');
  return client;
}

export async function offerStatus(workspaceId) {
  const state = await readState();
  if (state && state.workspaceId !== workspaceId) throw failure('El módulo pertenece a otro espacio');
  const client = await clientForWorkspace(workspaceId);
  const [promotions, scripts, record] = await Promise.all([
    state?.promotionId ? client.listPromotions().then((list) => list.filter((p) => String(p.id) === state.promotionId)) : [],
    client.listScripts().catch((e) => ({ error: `No se pudieron consultar los scripts (HTTP ${e.status || '?'})` })),
    repository.get(DEMO_STORE_ID),
  ]);
  const { rows } = await db.execute('SELECT created_at,cart_id,event_json FROM crossselling_offer_events ORDER BY id DESC LIMIT 12');
  return { storeId: DEMO_STORE_ID, state, promotions, scripts,
    publication: record ? { revision: record.revision, publishedAt: record.publishedAt, requestedEnabled: record.snapshot.enabled,
      selectedRules: record.snapshot.ruleIds.length, mappedProducts: record.diagnostics?.mappedProducts ?? null } : null,
    events: rows.map((r) => ({ at: r.created_at, cartId: r.cart_id, ...JSON.parse(r.event_json) })) };
}

export async function changeOffer(workspaceId, input) {
  const client = await demoClient(workspaceId);
  let state = await readState();
  if (state && state.workspaceId !== workspaceId) throw failure('El módulo pertenece a otro espacio');
  if (input.action === 'enable') {
    const record = await repository.get(DEMO_STORE_ID);
    if (!record || record.workspaceId !== workspaceId) throw failure('Primero publicá las reglas desde Mostrador');
    if (!record.snapshot.enabled || !record.snapshot.ruleIds.length) throw failure('En Mostrador, activá al menos una regla de Recomendaciones y volvé a publicar');
    if (!state?.promotionId) {
      const existing = (await client.listPromotions()).find((p) => p.name === NAME);
      const created = existing || await client.createPromotion({ name: NAME, ...PROMOTION_COMBINATION });
      const promotionId = String(created?.data?.id || created?.id || '');
      if (!promotionId) throw failure('Tiendanube no devolvió el ID de promoción', 502);
      state = { workspaceId, promotionId, acceptances: [] };
    }
    // El callback de descuentos es único por tienda: reemplaza al de la sonda de $1.
    state = { ...state, enabled: true };
    await saveState(state);
    await client.setDiscountCallback(callbackUrl(state));
    await client.updatePromotion(state.promotionId, { active: true });
  } else if (input.action === 'disable') {
    if (state) {
      state = { ...state, enabled: false, acceptances: [] };
      await saveState(state);
      await client.setDiscountCallback(callbackUrl(state));
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
  return offerStatus(workspaceId);
}

async function enabledState() {
  const state = await readState();
  if (!state?.enabled || !state.promotionId) throw failure('El módulo no está activo', 404);
  return state;
}

export async function offersForStorefront(items) {
  await enabledState();
  const { record, catalog } = await publication();
  return storefrontOffers(record.snapshot, catalog, items, record.catalog);
}

async function latestCallbackCart(cartId) {
  // El callback guarda el carrito después de responder: esperar unos segundos.
  for (let attempt = 0; attempt < 4; attempt++) {
    const { rows } = await db.execute({ sql: 'SELECT created_at,event_json FROM crossselling_offer_events WHERE cart_id=? ORDER BY id DESC LIMIT 1', args: [cartId] });
    if (rows[0] && Date.now() - Date.parse(rows[0].created_at) < 2 * 60 * 60_000) return JSON.parse(rows[0].event_json);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}

export async function acceptOffer({ cartId, triggerLineId, accessoryVariant }) {
  let state = await enabledState();
  await init();
  const { record, catalog } = await publication();
  const callbackCart = await latestCallbackCart(String(cartId));
  if (!callbackCart) throw failure('Tiendanube todavía no confirmó este carrito. Volvé a intentar en unos segundos.');
  const acceptance = buildAcceptance({ snapshot: record.snapshot, catalog, callbackCart, cartId, triggerLineId, accessoryVariant });
  state = { ...state, acceptances: addAcceptance(state.acceptances, acceptance) };
  await saveState(state);
  await (await clientForWorkspace(state.workspaceId)).setDiscountCallback(callbackUrl(state));
  return { accepted: true, pct: acceptance.pct, expiresAt: new Date(acceptance.expiresAt).toISOString() };
}

export function verifiedOfferState(token, encoded) { return signer().verify(token, encoded); }

export async function recordOfferEvent(cart, commands, elapsedMs) {
  // Sólo lo necesario para validar aceptaciones: sin cliente, dirección ni pagos.
  if (String(cart.store_id) !== DEMO_STORE_ID || !/^\d{1,30}$/.test(String(cart.cart_id))) return;
  await init();
  const event = { elapsedMs, tier: cart.execution_tier, currency: cart.currency, coupons: (cart.coupons || []).length,
    products: (cart.products || []).slice(0, 40).map((p) => ({ id: p.id, variantId: p.variant_id, quantity: p.quantity, price: p.price })),
    commands: commands.map((c) => c.command) };
  await db.batch([
    { sql: 'INSERT INTO crossselling_offer_events(created_at,cart_id,event_json) VALUES(?,?,?)', args: [new Date().toISOString(), String(cart.cart_id), JSON.stringify(event)] },
    'DELETE FROM crossselling_offer_events WHERE id <= (SELECT MAX(id)-500 FROM crossselling_offer_events)',
  ], 'write');
}
