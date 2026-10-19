// «Completá tu equipo» en la tienda demo: lógica pura, sin base de datos.
// El callback de descuentos recibe las aceptaciones dentro de su URL firmada
// (TN limita la URL a 255 caracteres), así que se conservan sólo las últimas.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { onlineRecommendations, onlineLines } from './engine/online-crossselling.js';
import { reglaSeDispara } from './engine/recommendations.js';
import { round2 } from './engine/pricing.js';
import { DEMO_STORE_ID } from './demo-probe-commands.js';

export const OFFER_CALLBACK_BASE = 'https://www.geomodi.ai/api/cross-selling/offer-callback/';
export const MAX_ACCEPTANCES = 3;
export const ACCEPTANCE_TTL_MS = 2 * 60 * 60_000;
export const OFFER_DISPLAY_TEXT = 'Completá tu equipo';

const b36 = (n) => Number(n).toString(36);
const fromB36 = (s) => parseInt(s, 36);
const digits = (v) => /^\d{1,15}$/.test(String(v ?? ''));

export function createOfferSigner(key, storeId = DEMO_STORE_ID) {
  if (typeof key !== 'string' || key.length < 32) throw new Error('Falta la clave del servidor');
  const sign = (encoded) => createHmac('sha256', key).update(`crossselling-offer-v1:${storeId}:${encoded}`).digest('hex').slice(0, 32);
  // La demo se registró sin parámetro de tienda: conservar esa URL.
  const storeParam = String(storeId) === DEMO_STORE_ID ? '' : `&st=${storeId}`;
  function encode(state) {
    const parts = [state.promotionId.replaceAll('-', ''), ...(state.acceptances || []).map((a) =>
      [a.cartId, a.triggerVariant, a.accessoryVariant, a.pct, a.minPriceCents, Math.floor(a.expiresAt / 1000)].map(b36).join('-'))];
    const encoded = parts.join('.');
    return { encoded, token: sign(encoded), url: `${OFFER_CALLBACK_BASE}${sign(encoded)}?s=${encoded}${storeParam}` };
  }
  function verify(token, encoded) {
    if (typeof encoded !== 'string' || !encoded || encoded.length > 255) return null;
    const expected = sign(encoded);
    if (typeof token !== 'string' || token.length !== expected.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return null;
    const [promotion, ...rest] = encoded.split('.');
    if (!/^[a-f0-9]{32}$/.test(promotion) || rest.length > MAX_ACCEPTANCES) return null;
    const acceptances = [];
    for (const part of rest) {
      if (!/^[0-9a-z]{1,10}(-[0-9a-z]{1,10}){5}$/.test(part)) return null;
      const [cartId, triggerVariant, accessoryVariant, pct, minPriceCents, expiry] = part.split('-').map(fromB36);
      if (!(pct > 0 && pct <= 100)) return null;
      acceptances.push({ cartId: String(cartId), triggerVariant: String(triggerVariant), accessoryVariant: String(accessoryVariant),
        pct, minPriceCents, expiresAt: expiry * 1000 });
    }
    return { storeId: String(storeId), promotionId: promotion.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'), acceptances };
  }
  return { encode, verify };
}

// Comandos para el callback. Usa sólo el carrito autoritativo enviado por TN.
export function offerCommands(state, cart, now = Date.now()) {
  if (!state?.promotionId || String(cart.store_id) !== String(state.storeId ?? DEMO_STORE_ID) || cart.execution_tier !== 'line_item') return [];
  const products = cart.products || [];
  const qty = (p) => (Number.isInteger(p.quantity) && p.quantity > 0 ? p.quantity : 0);
  const items = new Map();
  if (cart.currency === 'ARS' && !(cart.coupons || []).length) {
    for (const a of state.acceptances || []) {
      if (a.cartId !== String(cart.cart_id) || a.expiresAt <= now) continue;
      const triggers = products.filter((p) => String(p.variant_id) === a.triggerVariant).reduce((n, p) => n + qty(p), 0);
      const line = products.find((p) => String(p.variant_id) === a.accessoryVariant && qty(p));
      const price = Number(line?.price);
      // Si el precio bajó desde la aceptación, el margen validado deja de valer.
      if (!triggers || !line || items.has(String(line.id)) || !(price > 0) || Math.round(price * 100) < a.minPriceCents) continue;
      const amount = round2(round2(price * Math.min(qty(line), triggers)) * a.pct / 100);
      if (amount > 0) items.set(String(line.id), { line_item: String(line.id), discount_specs: { type: 'fixed', amount: amount.toFixed(2) } });
    }
  }
  const previous = (cart.promotions || []).find((p) => String(p.id) === state.promotionId);
  if (!items.size) return previous ? [{ command: 'remove_discount', specs: { scope: 'cart', promotion_ids: [state.promotionId] } }] : [];
  const commands = [];
  const stale = (previous?.line_items || []).map(String).filter((l) => !items.has(l));
  if (stale.length) commands.push({ command: 'remove_discount', specs: { scope: 'line_item', promotion_id: state.promotionId, line_items: stale } });
  commands.push({ command: 'create_or_update_discount', specs: { promotion_id: state.promotionId, currency: 'ARS',
    display_text: { 'es-ar': OFFER_DISPLAY_TEXT }, line_items: [...items.values()] } });
  return commands;
}

// Ofertas para mostrar en la tienda. Sin costos ni datos internos.
// `items` viene del navegador: sólo decide qué se muestra, nunca el descuento.
export function storefrontOffers(snapshot, catalog, items, rawCatalog = []) {
  const cart = { currency: 'ARS', products: items.map((i) => ({ id: i.lineId, variant_id: i.variantId, quantity: i.quantity })) };
  const lines = onlineLines(cart, catalog);
  const rules = new Map(snapshot.rules.map((r) => [r.id, r]));
  const values = new Map(rawCatalog.flatMap((p) => (p.variants || []).map((v) => [String(v.id), (v.values || []).map((x) => x?.es ?? Object.values(x || {})[0] ?? '')])));
  return onlineRecommendations(snapshot, catalog, cart).filter((o) => o.descuentoPct > 0).slice(0, 3).map((o) => {
    const trigger = lines.find((l) => reglaSeDispara(rules.get(o.reglaId), [l], catalog.productsById));
    return { variantId: o.variantId, productId: o.tnProductId, name: o.nombre, image: o.imagen, variant: o.variante,
      values: values.get(o.variantId) || [], price: o.precioFinal, discountedPrice: o.precioConDescuento,
      savings: round2(o.precioFinal - o.precioConDescuento), pct: o.descuentoPct, reason: o.motivo,
      triggerLineId: trigger?.lineId || null };
  }).filter((o) => o.triggerLineId);
}

// Valida una aceptación contra el carrito que TN envió al callback (no el del navegador).
export function buildAcceptance({ snapshot, catalog, callbackCart, cartId, triggerLineId, accessoryVariant, now = Date.now() }) {
  const fail = (m) => { throw Object.assign(new Error(m), { status: 409 }); };
  if (!digits(cartId) || !digits(triggerLineId) || !digits(accessoryVariant)) fail('Datos de carrito inválidos');
  const products = callbackCart?.products || [];
  const trigger = products.find((p) => String(p.id) === String(triggerLineId));
  if (!trigger) fail('El producto principal todavía no figura en el carrito');
  const items = products.map((p) => ({ lineId: String(p.id), variantId: String(p.variantId), quantity: p.quantity }));
  const offer = storefrontOffers(snapshot, catalog, items).find((o) => o.variantId === String(accessoryVariant));
  if (!offer || offer.triggerLineId !== String(triggerLineId)) fail('La oferta ya no está disponible para este carrito');
  return { cartId: String(cartId), triggerVariant: String(trigger.variantId), accessoryVariant: offer.variantId,
    pct: offer.pct, minPriceCents: Math.round(offer.price * 100), expiresAt: now + ACCEPTANCE_TTL_MS };
}

export function addAcceptance(acceptances, acceptance, now = Date.now()) {
  const kept = (acceptances || []).filter((a) => a.expiresAt > now &&
    !(a.cartId === acceptance.cartId && a.accessoryVariant === acceptance.accessoryVariant));
  return [...kept, acceptance].slice(-MAX_ACCEPTANCES);
}
