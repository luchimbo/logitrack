// Reseñas de productos: lógica pura compartida por Mostrador y Logitrack (sin I/O).
export const REVIEWS_SCHEMA = 1;
export const SOURCES = Object.freeze({ mercadolibre: "MercadoLibre", google: "Google", cliente: "Cliente de PC MIDI" });
// A la tienda viajan las más nuevas de cada producto (el promedio y el total cuentan todas): mantiene la publicación liviana.
export const MAX_PUBLISHED_PER_PRODUCT = 25;
const SNAPSHOT_TEXT = 500;
export const STATES = Object.freeze(["pendiente", "publicada", "oculta"]);
const sku = (v) => String(v || "").trim().toUpperCase();
const clip = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// Devuelve la reseña normalizada o lanza un error legible para quien la carga.
export function normalizeReview(raw, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const code = sku(raw.sku), rating = Number(raw.rating), text = clip(raw.texto, 1500), author = clip(raw.autor, 60);
  const source = String(raw.origen || "").trim().toLowerCase(), date = String(raw.fecha || "").trim().slice(0, 10), link = String(raw.enlace || "").trim();
  if (!code) throw new Error("Falta el SKU");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("La calificación debe ser un entero de 1 a 5");
  if (!author) throw new Error("Falta el nombre del autor");
  if (text.length < 3) throw new Error("Falta el texto de la opinión");
  if (!Object.hasOwn(SOURCES, source)) throw new Error(`Origen inválido (${Object.keys(SOURCES).join(", ")})`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || date > today) throw new Error("Fecha inválida: usá AAAA-MM-DD y no futura");
  if (link && !/^https:\/\/[^\s]+$/.test(link)) throw new Error("El enlace de origen debe empezar con https://");
  const state = STATES.includes(raw.estado) ? raw.estado : "pendiente";
  const external = clip(raw.externalId, 80);
  return { id: String(raw.id || ""), sku: code, rating, autor: author, texto: text, fecha: date, origen: source, enlace: link.slice(0, 300), estado: state,
    ...(external ? { externalId: external } : {}) };
}

// CSV con comillas y separador «,» o «;» (Excel en español exporta con «;»).
export function parseCsv(text) {
  const src = String(text || "").replace(/^﻿/, "");
  const first = src.split(/\r?\n/, 1)[0] || "";
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; row.push(cell); cell = ""; rows.push(row); row = []; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const HEADERS = { sku: "sku", rating: "rating", calificacion: "rating", estrellas: "rating", autor: "autor", texto: "texto", opinion: "texto", fecha: "fecha", origen: "origen", link: "enlace", enlace: "enlace" };
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// Separa las filas válidas de las que tienen errores (con su número de línea del archivo).
export function importCsv(text, opts) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("El archivo no tiene filas para importar");
  const cols = rows[0].map((h) => HEADERS[norm(h)] || null);
  for (const need of ["sku", "rating", "autor", "texto", "fecha", "origen"]) if (!cols.includes(need)) throw new Error(`Falta la columna «${need}»`);
  if (rows.length > 2001) throw new Error("Importá hasta 2000 reseñas por archivo");
  const valid = [], errors = [];
  rows.slice(1).forEach((cells, i) => {
    const raw = {}; cols.forEach((c, j) => { if (c) raw[c] = cells[j]; });
    try { valid.push(normalizeReview(raw, opts)); } catch (e) { errors.push({ line: i + 2, error: e.message }); }
  });
  return { valid, errors };
}

// Misma reseña (producto, autor, fecha y texto): no se vuelve a cargar.
export const reviewKey = (r) => [r.sku, r.autor, r.fecha, r.texto].map((x) => String(x).toLowerCase()).join("|");

export function buildReviewsSnapshot({ storeId, reviews, enabled, now = new Date() }) {
  const products = {};
  for (const r of reviews) {
    if (r.estado !== "publicada") continue;
    const p = products[r.sku] ||= { sum: 0, count: 0, reviews: [] };
    p.sum += r.rating; p.count++;
    p.reviews.push({ rating: r.rating, autor: r.autor, texto: r.texto, fecha: r.fecha, origen: r.origen, ...(r.enlace ? { enlace: r.enlace } : {}) });
  }
  for (const [code, p] of Object.entries(products)) {
    const newest = p.reviews.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, MAX_PUBLISHED_PER_PRODUCT)
      .map((r) => ({ ...r, texto: r.texto.slice(0, SNAPSHOT_TEXT) }));
    products[code] = { avg: Math.round((p.sum / p.count) * 10) / 10, count: p.count, reviews: newest };
  }
  return validateReviewsSnapshot({ schemaVersion: REVIEWS_SCHEMA, storeId: String(storeId), enabled: Boolean(enabled), generatedAt: now.toISOString(), products });
}

export function validateReviewsSnapshot(v) {
  const fail = () => { throw new Error("Reseñas online inválidas"); };
  if (!v || v.schemaVersion !== REVIEWS_SCHEMA || !/^\d+$/.test(v.storeId) || typeof v.enabled !== "boolean" ||
      !Number.isFinite(Date.parse(v.generatedAt)) || !v.products || typeof v.products !== "object" || Array.isArray(v.products)) fail();
  const codes = Object.keys(v.products);
  if (codes.length > 5000) fail();
  for (const code of codes) {
    const p = v.products[code];
    if (code !== sku(code) || !p || !Array.isArray(p.reviews) || p.reviews.length < 1 || p.reviews.length > 500 || !Number.isInteger(p.count) || p.count < p.reviews.length ||
        !(p.avg >= 1 && p.avg <= 5)) fail();
    for (const r of p.reviews) {
      if (!Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5 || typeof r.autor !== "string" || typeof r.texto !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(r.fecha) || !Object.hasOwn(SOURCES, r.origen) || (r.enlace != null && !/^https:\/\//.test(r.enlace))) fail();
    }
  }
  return v;
}
