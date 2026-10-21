// Adaptador puro: catálogo TN autenticado y configuración interna de Mostrador.
import { obtenerSugerencias, reglaSeDispara } from "./recommendations.js";
import { descuentoSeguro, round2 } from "./pricing.js";

export const ONLINE_SCHEMA = 1;
export const ENGINE_VERSION = "mostrador-crossselling-1";
const sku = (v) => String(v || "").trim().toUpperCase();
const text = (v) => typeof v === "object" && v ? v.es || Object.values(v)[0] || "" : String(v || "");
const positive = (n) => n !== null && n !== "" && Number.isFinite(Number(n)) && Number(n) > 0;
const numeric = (n) => typeof n === "number" && Number.isFinite(n);
const id = (n) => typeof n === "string" && n.length > 0 && n.length <= 120;

export function validateSnapshot(v) {
  const fail = () => { throw new Error("Configuración online inválida"); };
  if (!v || v.schemaVersion !== ONLINE_SCHEMA || v.engineVersion !== ENGINE_VERSION || !/^\d+$/.test(v.storeId) ||
      typeof v.enabled !== "boolean" || !Array.isArray(v.ruleIds) || !v.ruleIds.every(id) ||
      !Array.isArray(v.rules) || v.rules.length > 1000 || !Array.isArray(v.products) || v.products.length > 30000 ||
      !Number.isFinite(Date.parse(v.generatedAt))) fail();
  const s = v.settings;
  if (!s || !numeric(s.descuentoMaximoPct) || s.descuentoMaximoPct < 0 || s.descuentoMaximoPct > 100 ||
      !numeric(s.margenMinimoPct) || s.margenMinimoPct < 0 || !Number.isInteger(s.maxSugerencias) || s.maxSugerencias < 1 || s.maxSugerencias > 20) fail();
  const productIds = new Set();
  for (const p of v.products) {
    if (!p || !id(p.id) || productIds.has(p.id) || !sku(p.codigo) || typeof p.nombre !== "string" ||
        !numeric(p.precioFinal) || p.precioFinal <= 0 || !numeric(p.costo) || p.costo < 0 ||
        !numeric(p.iva) || p.iva < 0 || p.iva > 100 || !(p.stock === null || (numeric(p.stock) && p.stock >= 0)) || p.productoPrueba) fail();
    productIds.add(p.id);
  }
  const ruleIds = new Set();
  for (const r of v.rules) {
    if (!r || !id(r.id) || ruleIds.has(r.id) || typeof r.activa !== "boolean" ||
        !["producto", "rubro", "subrubro", "nombre"].includes(r.disparador?.tipo) || typeof r.disparador.valor !== "string" ||
        !Array.isArray(r.sugeridos) || !r.sugeridos.every(id) || !numeric(r.descuentoPct) || r.descuentoPct < 0 || r.descuentoPct > 100) fail();
    ruleIds.add(r.id);
  }
  if (v.ruleIds.some((r) => !ruleIds.has(r))) fail();
  return v;
}

export function buildSnapshot({ storeId, products, rules, settings, enabled = false, ruleIds = [], now = new Date() }) {
  // Lista explícita de campos: no enviar credenciales, clientes, ventas ni facturación.
  return validateSnapshot({
    schemaVersion: ONLINE_SCHEMA, engineVersion: ENGINE_VERSION, storeId: String(storeId), generatedAt: now.toISOString(), enabled, ruleIds: ruleIds.map(String),
    settings: { descuentoMaximoPct: settings.descuentoMaximoPct, margenMinimoPct: settings.margenMinimoPct, maxSugerencias: settings.maxSugerencias },
    products: products.filter((p) => !p.productoPrueba && sku(p.codigo)).map((p) => ({
      id: String(p.id), codigo: sku(p.codigo), nombre: p.nombre, rubro: p.rubro || "", subrubro: p.subrubro || null,
      precioFinal: Number(p.precioFinal), costo: Number(p.costo || 0), iva: Number(p.iva ?? 21), stock: p.stock == null ? null : Math.max(0, Number(p.stock)),
    })),
    rules: rules.map((r) => ({
      id: String(r.id), nombre: String(r.nombre || ""), activa: Boolean(r.activa),
      disparador: { tipo: r.disparador.tipo, valor: String(r.disparador.valor), excluir: String(r.disparador.excluir || "") },
      sugeridos: r.sugeridos.map(String), descuentoPct: Number(r.descuentoPct || 0), mensaje: String(r.mensaje || ""),
    })),
  });
}

function uniqueBySku(products, code) {
  const result = new Map();
  for (const p of products) { const key = sku(code(p)); if (key) result.set(key, result.has(key) ? null : p); }
  return result;
}

export function mapOnlineCatalog(snapshot, tnProducts) {
  validateSnapshot(snapshot);
  const source = uniqueBySku(snapshot.products, (p) => p.codigo);
  const variants = tnProducts.flatMap((p) => (p.variants || []).map((v) => ({ product: p, variant: v })));
  const bySku = uniqueBySku(variants, ({ variant }) => variant.sku);
  const productsById = new Map(), byVariant = new Map(), excluded = [];
  for (const [code, sourceProduct] of source) {
    const found = bySku.get(code);
    if (!sourceProduct || !found) { excluded.push({ sku: code, reason: "SKU ausente o ambiguo" }); continue; }
    const { product, variant } = found;
    const promo = Number(variant.promotional_price), list = Number(variant.price);
    const price = promo > 0 && promo < list ? promo : list;
    if (product.published !== true || !positive(price) || sourceProduct.stock === 0 ||
        (variant.stock_management !== false && !positive(variant.stock))) {
      excluded.push({ sku: code, reason: "No publicado, sin precio o sin stock" }); continue;
    }
    if (!positive(product.id) || !positive(variant.id)) continue;
    const image = product.images?.find((i) => String(i.id) === String(variant.image_id)) || product.images?.[0];
    const p = { ...sourceProduct, nombre: text(product.name) || sourceProduct.nombre, precioFinal: price,
      stock: variant.stock_management === false ? null : Number(variant.stock), imagen: image?.src || null,
      tnProductId: String(product.id), variantId: String(variant.id), variante: (variant.values || []).map(text).join(" / ") };
    productsById.set(p.id, p); byVariant.set(p.variantId, p);
  }
  return { productsById, byVariant, excluded };
}

export function onlineLines(cart, catalog) {
  return (cart.products || []).map((l) => {
    const p = catalog.byVariant.get(String(l.variant_id));
    return p ? { lineId: String(l.id), productId: p.id, cantidad: Number(l.quantity), variantId: p.variantId } : null;
  }).filter(Boolean);
}

export function onlineRecommendations(snapshot, catalog, cart) {
  if (!snapshot.enabled || cart.currency !== "ARS" || (cart.coupons || []).length) return [];
  return obtenerSugerencias(onlineLines(cart, catalog), catalog.productsById,
    snapshot.rules.filter((r) => snapshot.ruleIds.includes(r.id)), snapshot.settings).map((offer) => {
    const p = catalog.productsById.get(String(offer.productId));
    return { ...offer, variantId: p.variantId, tnProductId: p.tnProductId, variante: p.variante };
  });
}

// Sólo invocar con el carrito autoritativo del callback y aceptaciones persistidas.
export function discountCommands({ snapshot, revision, catalog, cart, acceptances, promotionIds, enabled = false, now = Date.now() }) {
  if (String(cart.store_id) !== snapshot.storeId || cart.execution_tier !== "line_item") return { commands: [] };
  const commands = [], lines = onlineLines(cart, catalog);
  const applied = new Set((cart.promotions || []).map((p) => String(p.id)));
  for (const [ruleId, promotionId] of Object.entries(promotionIds)) {
    const rule = snapshot.rules.find((r) => r.id === ruleId), items = [];
    if (enabled && snapshot.enabled && snapshot.ruleIds.includes(ruleId) && rule?.activa &&
        cart.currency === "ARS" && !(cart.coupons || []).length && cart.execution_tier === "line_item") {
      for (const line of cart.products || []) {
        const product = catalog.byVariant.get(String(line.variant_id));
        const firstRule = product && snapshot.rules.find((r) => snapshot.ruleIds.includes(r.id) && r.activa &&
          r.sugeridos.map(String).includes(product.id) && reglaSeDispara(r, lines, catalog.productsById, String(line.id)));
        const accepted = acceptances.find((a) => a.storeId === String(cart.store_id) && a.cartId === String(cart.cart_id) &&
          a.revision === revision && a.ruleId === ruleId && a.variantId === String(line.variant_id) && a.expiresAt > now);
        if (!product || !accepted || firstRule?.id !== ruleId || !rule.sugeridos.map(String).includes(product.id) ||
            !reglaSeDispara(rule, lines, catalog.productsById, String(line.id)) || !positive(line.price) ||
            !Number.isInteger(line.quantity) || line.quantity < 1) continue;
        const pct = descuentoSeguro({ ...product, precioFinal: Number(line.price) }, rule.descuentoPct, snapshot.settings);
        const amount = round2(round2(Number(line.price) * line.quantity) * pct / 100);
        if (amount > 0) items.push({ line_item: String(line.id), discount_specs: { type: "fixed", amount: amount.toFixed(2) } });
      }
    }
    if (items.length) {
      const previous = (cart.promotions || []).find((p) => String(p.id) === String(promotionId));
      const stale = (previous?.line_items || []).map(String).filter((l) => !items.some((i) => i.line_item === l));
      if (stale.length) commands.push({ command: "remove_discount", specs: { scope: "line_item", promotion_id: promotionId, line_items: stale } });
      commands.push({ command: "create_or_update_discount", specs: { promotion_id: promotionId, currency: "ARS", display_text: { "es-ar": "Completá tu equipo" }, line_items: items } });
    } else if (applied.has(String(promotionId))) {
      commands.push({ command: "remove_discount", specs: { scope: "cart", promotion_ids: [promotionId] } });
    }
  }
  return { commands };
}

export const PROMOTION_COMBINATION = Object.freeze({
  allocation_type: "line_item", active: false, combines_with_quantity_discounts: false, combines_with_free_shipping: true,
  // TN agrupa cupones y medios de pago. El callback excluye carritos con cupones.
  combines_with_cart_amount_discounts: true, combines_with_app_discounts: false, combines_with_price_discounts: true,
});
