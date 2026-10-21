"use client";

import { useMemo, useState } from 'react';
import shapes from '@/lib/financeMapShapes.json';
import { combineZoneSummaries, MAP_ZONES, periodPreset, ZONE_COLORS } from '@/lib/financeMap';
import styles from './FinanceMapDashboard.module.css';

const moneyFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
const numberFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const money = (value) => value === null || value === undefined ? '—' : moneyFormat.format(value / 100);
const percent = (value) => value === null || value === undefined ? '—' : `${numberFormat.format(value)} %`;
const PRESETS = [['today', 'Hoy'], ['7', '7 días'], ['30', '30 días'], ['month', 'Este mes'], ['previous', 'Mes anterior'], ['all', 'Todo']];

export default function FinanceMapDashboard({ report, filters, selected, onSelect, onPeriod, onMethod, onDetail, loading }) {
  const [hovered, setHovered] = useState(null);
  const [zoom, setZoom] = useState(1);
  const groups = report?.byZone || [];
  const summary = useMemo(() => combineZoneSummaries(report?.byZone || [], selected), [report, selected]);
  const groupMap = new Map(groups.map((g) => [g.name === 'Sin dato' ? '__missing__' : g.name, g]));
  const toggle = (zone) => onSelect(selected.includes(zone) ? selected.filter((item) => item !== zone) : [...selected, zone]);
  const selectionName = selected.length ? selected.map((zone) => zone === '__missing__' ? 'Sin zona' : zone).join(' + ') : 'Todas las zonas';
  const width = 760 / zoom, height = 600 / zoom;
  const viewBox = `${380 - width / 2} ${300 - height / 2} ${width} ${height}`;
  const scope = report ? summary.count ? `${summary.count} envíos en la selección` : 'Sin envíos en este período' : 'Calculando el período…';
  const visibleZones = groupMap.has('__missing__') ? [...MAP_ZONES, '__missing__'] : MAP_ZONES;
  return <div className={styles.dashboard}>
    <section className={styles.period} aria-label="Período del mapa">
      <div className={styles.periodTop}><div><span className={styles.kicker}>01 · Elegí el período</span><h2>¿Qué período querés consultar?</h2></div><span className={styles.dateBasis}>Por fecha de despacho</span></div>
      <div className={styles.periodControls}><div className={styles.presets}>{PRESETS.map(([key, label]) => {
        const range = periodPreset(key);
        const active = (filters.from || '') === range.from && (filters.to || '') === range.to;
        return <button key={key} type="button" aria-pressed={active} onClick={() => onPeriod(range)}>{label}</button>;
      })}</div><div className={styles.dates}><label>Desde<input type="date" value={filters.from || ''} max={filters.to || undefined} onChange={(e) => onPeriod({ from: e.target.value, to: filters.to || '' })} /></label><span aria-hidden="true">→</span><label>Hasta<input type="date" value={filters.to || ''} min={filters.from || undefined} onChange={(e) => onPeriod({ from: filters.from || '', to: e.target.value })} /></label></div><label className={styles.method}>Envíos<select value={filters.method || ''} onChange={(e) => onMethod(e.target.value)}><option value="">Flex y Colecta</option><option value="flex">Solo Flex</option><option value="colecta">Solo Colecta</option></select></label></div>
    </section>
    <div className={styles.workspace}>
      <section className={styles.mapPanel} aria-label="Selección de zonas en el mapa">
        <div className={styles.mapHeading}><div><span className={styles.kicker}>02 · Marcá las zonas</span><h2>Tu operación, en el mapa</h2><p>Podés seleccionar más de una. Los importes se suman solos.</p></div><button type="button" className={styles.reset} aria-pressed={!selected.length} onClick={() => onSelect([])}>Todas las zonas</button></div>
        <div className={styles.mapCanvas}>
          <div className={styles.compass} aria-hidden="true">↑ <span>N</span></div>
          <div className={styles.zoom}><button type="button" aria-label="Acercar mapa" disabled={zoom >= 2} onClick={() => setZoom(Math.min(2, zoom + .25))}>+</button><button type="button" aria-label="Alejar mapa" disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - .25))}>−</button></div>
          <svg viewBox={viewBox} className={styles.map} aria-label="Mapa de CABA y partidos del Gran Buenos Aires" role="group">
            <defs><pattern id="finance-map-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="currentColor" strokeOpacity=".04" /></pattern></defs>
            <rect x="-500" y="-500" width="2000" height="1600" fill="url(#finance-map-grid)" />
            <text x={shapes.river[0]} y={shapes.river[1]} className={styles.river} transform={`rotate(-32 ${shapes.river[0]} ${shapes.river[1]})`}>RÍO DE LA PLATA</text>
            {MAP_ZONES.map((zone) => {
              const active = selected.includes(zone), muted = selected.length > 0 && !active;
              const data = groupMap.get(zone);
              return <g key={zone} role="button" tabIndex={0} aria-label={`Seleccionar ${zone}`} aria-pressed={active} className={styles.zone} style={{ '--zone-color': ZONE_COLORS[zone], opacity: muted ? .25 : 1 }} onClick={() => toggle(zone)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(zone); } }} onMouseEnter={() => setHovered(zone)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(zone)} onBlur={() => setHovered(null)}>
                <title>{zone} · {data?.count || 0} envíos · Ventas {money(data?.salesCents)}</title>
                {shapes.shapes.filter((shape) => shape.zone === zone).map((shape) => <path key={shape.name} d={shape.path} fillRule="evenodd" className={active ? styles.selectedPath : styles.zonePath}><title>{shape.name} · {zone}</title></path>)}
              </g>;
            })}
            {shapes.labels.map(({ zone, point }) => <text key={zone} x={point[0]} y={point[1]} className={styles.zoneLabel} style={{ fill: ZONE_COLORS[zone] }}>{zone}</text>)}
          </svg>
          <div className={styles.mapHint} aria-live="polite">{hovered ? <><i style={{ background: ZONE_COLORS[hovered] }} /><strong>{hovered}</strong><span>{groupMap.get(hovered)?.count || 0} envíos</span><span>Ventas {money(groupMap.get(hovered)?.salesCents)}</span></> : <span>Hacé clic en una zona para seleccionarla</span>}</div>
        </div>
        <div className={styles.zoneLegend}>{visibleZones.map((zone) => {
          const g = groupMap.get(zone);
          return <button key={zone} type="button" aria-pressed={selected.includes(zone)} onClick={() => toggle(zone)} style={{ '--zone-color': ZONE_COLORS[zone] }}><i /><span>{zone === '__missing__' ? 'Sin zona' : zone}</span><small>{g?.count || 0} envíos</small><b>{selected.includes(zone) ? '✓' : '+'}</b></button>;
        })}</div>
        <details className={styles.mapSource}><summary>Cómo se agrupan las zonas</summary><p>Se usan las zonas operativas de la app. Los límites del mapa siguen los partidos; La Matanza Norte se contabiliza en GBA 1 según el dato del envío y se selecciona desde su botón. Los envíos fuera del mapa o sin zona siguen incluidos en los totales.</p><p>Geometrías: <a href="https://www.geoboundaries.org/api.html" target="_blank" rel="noreferrer">{shapes.attribution}</a>. La selección solo filtra la consulta.</p></details>
      </section>
      <aside className={styles.summary} aria-label="Resumen de las zonas seleccionadas" aria-busy={loading}>
        <div className={styles.summaryHead}><span className={styles.kicker}>03 · Tu resumen automático</span><h2>{selectionName}</h2><p role="status">{scope}</p></div>
        <div className={styles.sales}><span>Ventas brutas pagadas</span><strong>{report ? money(summary.salesCents) : '—'}</strong><small>{summary.paidOrderCount} pedidos pagados</small></div>
        <div className={styles.summaryGrid}><Stat label="Gasto logístico" value={report && summary.knownCount ? money(summary.totalCents) : '—'} /><Stat label="Envíos" value={report ? summary.count : '—'} /><Stat label="Costo promedio / envío" value={money(summary.averageCents)} /><Stat label="Venta promedio / pedido" value={money(summary.averageSaleCents)} /></div>
        <div className={styles.ratio}><span>Gasto sobre ventas</span><strong>{percent(summary.logisticsPercent)}</strong><div className={styles.ratioTrack}><span style={{ width: `${Math.min(100, summary.logisticsPercent || 0)}%` }} /></div><small>{summary.comparableCount} envíos con ambos importes completos</small></div>
        <dl className={styles.costs}><div><dt>Gasto Flex</dt><dd>{report && summary.knownCount ? money(summary.flexCents) : '—'}</dd></div><div><dt>Gasto Colecta</dt><dd>{report && summary.knownCount ? money(summary.colectaCents) : '—'}</dd></div></dl>
        {summary.missingCount || summary.salesMissingCount || summary.salesUnavailableCount ? <div className={styles.coverage}>{summary.missingCount} envíos sin costo · {summary.salesUnavailableCount} sin importe de venta.{summary.salesMissingCount ? <span> {summary.salesMissingCount} pedidos con venta no computable.</span> : null}<small>Los promedios usan solo los importes conocidos.</small></div> : null}
        <button type="button" className={styles.detailButton} onClick={onDetail}>Ver detalle de estos envíos <span aria-hidden="true">↗</span></button>
      </aside>
    </div>
    <p className={styles.footnote}>Ventas de Mercado Libre de los envíos Flex y Colecta del período de despacho. Importes brutos en ARS, sin descontar comisiones, impuestos ni devoluciones parciales. Los costos Flex requieren tarifas cargadas.</p>
  </div>;
}

function Stat({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
