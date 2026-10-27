import { getArgentinaDateString } from './dateUtils.js';
import { normalizeName, ZONE_GROUPS } from './zoneGroups.js';

export const MAP_ZONES = ['CABA', 'GBA 1', 'GBA 2', 'GBA 3'];
export const ZONE_COLORS = { CABA: '#6ee7b7', 'GBA 1': '#60a5fa', 'GBA 2': '#c4a4f9', 'GBA 3': '#fbbf74', '__missing__': '#94a3b8' };

// Averages are weighted by the underlying shipments/orders, never by zone.
export function combineZoneSummaries(groups, selected = []) {
  const chosen = groups.filter((g) => !selected.length || selected.includes(g.name === 'Sin dato' ? '__missing__' : g.name));
  const fields = ['count', 'knownCount', 'missingCount', 'paidOrderCount', 'paidKnownOrderCount',
    'salesMissingCount', 'salesUnavailableCount', 'totalCents', 'flexCents', 'colectaCents',
    'flexCount', 'colectaCount', 'tiendanubeCostCents', 'tiendanubeCostCount', 'colectaMlCents', 'shippingCollectedCents', 'shippingCollectedCount', 'shippingCollectedMissingCount', 'customWithoutCostCount', 'feesCents', 'feesUnavailableCount', 'feesCount', 'netCents', 'netCount', 'netAfterShippingCents', 'netAfterShippingCount', 'comparableCount', 'comparableSalesCents', 'comparableCostCents', 'estimatedFlexCents', 'payableFlexCents', 'delayed', 'incidents'];
  const result = Object.fromEntries(fields.map((field) => [field, chosen.reduce((n, g) => n + (g[field] || 0), 0)]));
  result.salesCents = chosen.some((g) => g.salesCents !== null && g.salesCents !== undefined)
    ? chosen.reduce((n, g) => n + (g.salesCents || 0), 0) : null;
  // Reconcile across groups, including expenses in groups without linked sales.
  result.netCents = result.salesCents === null ? null : result.salesCents + result.shippingCollectedCents - result.feesCents;
  result.netAfterShippingCents = result.netCents === null ? null : result.netCents - result.totalCents;
  result.averageCents = result.knownCount ? Math.round(result.totalCents / result.knownCount) : null;
  result.averageSaleCents = result.paidKnownOrderCount && result.salesCents !== null ? Math.round(result.salesCents / result.paidKnownOrderCount) : null;
  result.logisticsPercent = result.comparableSalesCents ? result.comparableCostCents / result.comparableSalesCents * 100 : null;
  return result;
}

export function periodPreset(preset, now = new Date()) {
  const today = getArgentinaDateString(now);
  const day = new Date(`${today}T12:00:00Z`);
  if (preset === 'all') return { from: '', to: '' };
  if (preset === 'today') return { from: today, to: today };
  if (preset === '7' || preset === '30') {
    day.setUTCDate(day.getUTCDate() - Number(preset) + 1);
    return { from: day.toISOString().slice(0, 10), to: today };
  }
  if (preset === 'previous') {
    day.setUTCDate(0);
    return { from: `${day.toISOString().slice(0, 7)}-01`, to: day.toISOString().slice(0, 10) };
  }
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

// Map shapes follow official partido names; shipments store the app's partido keys.
const SHAPE_ALIASES = { general_san_martin: ['san_martin'], tres_de_febrero: ['3_de_febrero'], presidente_peron: ['pte_peron'] };
export function shapePartidoKeys(shapeName) {
  if (String(shapeName).startsWith('Comuna ')) return ['capital_federal'];
  const key = normalizeName(shapeName);
  return SHAPE_ALIASES[key] || [key];
}
export const PARTIDO_LABELS = { capital_federal: 'CABA', '3_de_febrero': 'Tres de Febrero', san_martin: 'General San Martín', pte_peron: 'Presidente Perón',
  la_matanza: 'La Matanza (sin dividir)', la_matanza_norte: 'La Matanza Norte', la_matanza_sur: 'La Matanza Sur', jose_c_paz: 'José C. Paz', dique_lujan: 'Dique Luján' };
export function partidoLabel(key) {
  if (key === '__missing__') return 'Sin partido';
  return PARTIDO_LABELS[key] || String(key).split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
export const MAP_PARTIDOS = Object.entries(ZONE_GROUPS).map(([key, zone]) => ({ key, zone, label: partidoLabel(key) }))
  .sort((a, b) => a.label.localeCompare(b.label, 'es'));

// Province names arrive in many spellings (ML, labels, Zipnova); fold them into one key per province.
const PROVINCE_ALIASES = { capital_federal: 'caba', caba: 'caba', c_a_b_a: 'caba', ciudad_de_buenos_aires: 'caba', ciudad_autonoma_de_buenos_aires: 'caba',
  ciudad_autonoma_buenos_aires: 'caba', autonomous_city_of_buenos_aires: 'caba', bs_as: 'buenos_aires', gba: 'buenos_aires', provincia_de_buenos_aires: 'buenos_aires',
  pcia_de_buenos_aires: 'buenos_aires', la_roja: 'la_rioja' };
export function provinceKey(name) {
  const key = normalizeName(name).replace(/^(provincia|pcia)_(de_|del_)?/, '');
  if (!key) return '';
  if (key.startsWith('tierra_del_fuego')) return 'tierra_del_fuego';
  return PROVINCE_ALIASES[key] || PROVINCE_ALIASES[normalizeName(name)] || key;
}
export const PROVINCE_LABELS = { caba: 'CABA', buenos_aires: 'Buenos Aires', catamarca: 'Catamarca', chaco: 'Chaco', chubut: 'Chubut', cordoba: 'Córdoba',
  corrientes: 'Corrientes', entre_rios: 'Entre Ríos', formosa: 'Formosa', jujuy: 'Jujuy', la_pampa: 'La Pampa', la_rioja: 'La Rioja', mendoza: 'Mendoza',
  misiones: 'Misiones', neuquen: 'Neuquén', rio_negro: 'Río Negro', salta: 'Salta', san_juan: 'San Juan', san_luis: 'San Luis', santa_cruz: 'Santa Cruz',
  santa_fe: 'Santa Fe', santiago_del_estero: 'Santiago del Estero', tierra_del_fuego: 'Tierra del Fuego', tucuman: 'Tucumán' };
export function provinceLabel(key) {
  if (!key || key === '__missing__' || key === 'Sin dato') return 'Sin provincia';
  return PROVINCE_LABELS[key] || partidoLabel(key);
}
