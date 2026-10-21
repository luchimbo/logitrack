import { getArgentinaDateString } from './dateUtils.js';

export const MAP_ZONES = ['CABA', 'GBA 1', 'GBA 2', 'GBA 3'];
export const ZONE_COLORS = { CABA: '#6ee7b7', 'GBA 1': '#60a5fa', 'GBA 2': '#c4a4f9', 'GBA 3': '#fbbf74', '__missing__': '#94a3b8' };

// Averages are weighted by the underlying shipments/orders, never by zone.
export function combineZoneSummaries(groups, selected = []) {
  const chosen = groups.filter((g) => !selected.length || selected.includes(g.name === 'Sin dato' ? '__missing__' : g.name));
  const fields = ['count', 'knownCount', 'missingCount', 'paidOrderCount', 'paidKnownOrderCount',
    'salesMissingCount', 'salesUnavailableCount', 'totalCents', 'flexCents', 'colectaCents',
    'comparableCount', 'comparableSalesCents', 'comparableCostCents', 'estimatedFlexCents', 'payableFlexCents', 'delayed', 'incidents'];
  const result = Object.fromEntries(fields.map((field) => [field, chosen.reduce((n, g) => n + (g[field] || 0), 0)]));
  result.salesCents = chosen.some((g) => g.salesCents !== null && g.salesCents !== undefined)
    ? chosen.reduce((n, g) => n + (g.salesCents || 0), 0) : null;
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
