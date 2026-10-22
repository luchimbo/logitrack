"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import shapes from '@/lib/financeMapShapes.json';
import provinceShapes from '@/lib/financeProvinceShapes.json';
import { combineZoneSummaries, MAP_PARTIDOS, MAP_ZONES, partidoLabel, periodPreset, provinceKey, provinceLabel, PROVINCE_LABELS, shapePartidoKeys, ZONE_COLORS } from '@/lib/financeMap';
import styles from './FinanceMapDashboard.module.css';

const moneyFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
const numberFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const money = (value) => value === null || value === undefined ? '—' : moneyFormat.format(value / 100);
const percent = (value) => value === null || value === undefined ? '—' : `${numberFormat.format(value)} %`;
const PRESETS = [['today', 'Hoy'], ['7', '7 días'], ['30', '30 días'], ['month', 'Este mes'], ['previous', 'Mes anterior'], ['all', 'Todo']];
const METHOD_COLORS = { flex: '#fbbf74', colecta: '#60a5fa' };
// Province fill: the selected method's color, or in "Todo" a blend weighted by each method's share of shipments.
function methodColor(method, data) {
  if (method === 'flex' || method === 'colecta') return METHOD_COLORS[method];
  const flex = data?.flexCount || 0, total = flex + (data?.colectaCount || 0);
  if (!total) return '#94a3b8';
  return `color-mix(in srgb, ${METHOD_COLORS.flex} ${Math.round(flex / total * 100)}%, ${METHOD_COLORS.colecta})`;
}
const AMBA_PROVINCES = ['caba', 'buenos_aires'];

const MAX_ZOOM = 10;
const DIMS = { amba: [760, 600], argentina: provinceShapes.viewBox.slice(2) };
const homeView = (level) => ({ zoom: 1, cx: DIMS[level][0] / 2, cy: DIMS[level][1] / 2 });
// Keep the visible window around the map.
function clampView({ zoom, cx, cy }, [mapW, mapH]) {
  const z = Math.min(MAX_ZOOM, Math.max(1, zoom));
  const hw = mapW / z / 2, hh = mapH / z / 2;
  // Some slack past the edges, so the map can also be nudged when fully zoomed out.
  const mx = hw * .5, my = hh * .5;
  return { zoom: z, cx: Math.min(mapW - hw + mx, Math.max(hw - mx, cx)), cy: Math.min(mapH - hh + my, Math.max(hh - my, cy)) };
}
// The svg letterboxes the viewBox (xMidYMid meet): translate screen pixels to viewBox units.
function frame(view, rect, [mapW, mapH]) {
  const w = mapW / view.zoom, h = mapH / view.zoom;
  const scale = Math.min(rect.width / w, rect.height / h);
  return { w, h, scale, offX: (rect.width - w * scale) / 2, offY: (rect.height - h * scale) / 2 };
}
const groupKey = (g) => g.name === 'Sin dato' ? '__missing__' : g.name;

const KINDS = [['flex', 'Flex'], ['colecta', 'Colecta'], ['all', 'Todo']];
const KIND_TITLES = { flex: ['Mapa Flex', 'Solo envíos Flex, en el AMBA.'], colecta: ['Mapa Colecta', 'Mercado Libre y pedidos con envío de Tiendanube.'], all: ['Mapa total', 'Flex y Colecta juntos.'] };

export default function FinanceMapDashboard({ kind = 'all', onKind = () => {}, report, refreshing = false, filters, selected, onSelect, partidos = [], onPartidos = () => {}, mode = 'zone', onMode = () => {},
  provinces = [], onProvinces = () => {}, level = 'amba', onLevel = () => {}, onPeriod, onDetail }) {
  const loading = refreshing;
  const [hovered, setHovered] = useState(null);
  const [views, setViews] = useState({});
  const view = views[level] || homeView(level);
  const dims = DIMS[level];
  const setView = (update) => setViews((all) => ({ ...all, [level]: typeof update === 'function' ? update(all[level] || homeView(level)) : update }));
  const svgRef = useRef(null);
  const drag = useRef(null);
  const moved = useRef(false);
  const [search, setSearch] = useState('');
  const country = level === 'argentina';
  const byPartido = !country && mode === 'partido';
  const groups = useMemo(() => (country ? report?.byProvince : byPartido ? report?.byPartido : report?.byZone) || [], [report, country, byPartido]);
  const chosen = country ? provinces : byPartido ? partidos : selected;
  const summary = useMemo(() => combineZoneSummaries(groups, chosen), [groups, chosen]);
  const allSummary = useMemo(() => combineZoneSummaries(groups, []), [groups]);
  const groupMap = new Map(groups.map((g) => [groupKey(g), g]));
  const partidoGroups = useMemo(() => new Map((report?.byPartido || []).map((g) => [groupKey(g), g])), [report]);
  const partidoOptions = useMemo(() => {
    const known = new Set(MAP_PARTIDOS.map((p) => p.key));
    const extra = [...partidoGroups.keys()].filter((key) => key !== '__missing__' && !known.has(key)).map((key) => ({ key, zone: '', label: partidoLabel(key) }));
    return [...MAP_PARTIDOS, ...extra];
  }, [partidoGroups]);
  const provinceOptions = Object.keys(PROVINCE_LABELS).map((key) => ({ key, label: provinceLabel(key) })).sort((a, b) => a.label.localeCompare(b.label, 'es'));
  const labelOf = (key) => key === '__missing__' ? (country ? 'Sin provincia' : byPartido ? 'Sin partido' : 'Sin zona') : country ? provinceLabel(key) : byPartido ? partidoLabel(key) : key;
  const rowsByName = groups.map((g) => ({ ...g, label: labelOf(groupKey(g)) })).sort((x, y) => (y.count || 0) - (x.count || 0));
  const term = search.trim().toLowerCase();
  const visiblePartidos = partidoOptions.filter((p) => !term || p.label.toLowerCase().includes(term));
  const visibleProvinces = provinceOptions.filter((p) => !term || p.label.toLowerCase().includes(term));
  const showMissing = !term || (country ? 'sin provincia' : 'sin partido').includes(term);
  const togglePartidos = (keys) => { const all = keys.every((key) => partidos.includes(key)); onPartidos(all ? partidos.filter((key) => !keys.includes(key)) : [...new Set([...partidos, ...keys])]); };
  const toggleProvince = (key) => onProvinces(provinces.includes(key) ? provinces.filter((item) => item !== key) : [...provinces, key]);
  const toggle = (zone) => onSelect(selected.includes(zone) ? selected.filter((item) => item !== zone) : [...selected, zone]);
  const selectionName = country
    ? provinces.length ? provinces.length > 4 ? `${provinces.length} provincias` : provinces.map(provinceLabel).join(' + ') : 'Todo el país'
    : byPartido
      ? partidos.length ? partidos.length > 4 ? `${partidos.length} partidos` : partidos.map(partidoLabel).join(' + ') : 'Todos los partidos'
      : selected.length ? selected.map((zone) => zone === '__missing__' ? 'Sin zona' : zone).join(' + ') : 'Todas las zonas';
  const maxProvince = Math.max(1, ...groups.filter((g) => g.name !== 'Sin dato').map((g) => g.count || 0));
  const width = dims[0] / view.zoom, height = dims[1] / view.zoom;
  const viewBox = `${view.cx - width / 2} ${view.cy - height / 2} ${width} ${height}`;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const size = DIMS[level];
    // Wheel zoom keeps the point under the cursor in place; needs a non-passive listener to stop the page scrolling.
    const onWheel = (event) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      setViews((all) => {
        const v = all[level] || homeView(level);
        const before = frame(v, rect, size);
        const px = v.cx - before.w / 2 + (event.clientX - rect.left - before.offX) / before.scale;
        const py = v.cy - before.h / 2 + (event.clientY - rect.top - before.offY) / before.scale;
        const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom * (event.deltaY < 0 ? 1.2 : 1 / 1.2)));
        const after = frame({ ...v, zoom }, rect, size);
        return { ...all, [level]: clampView({ zoom,
          cx: px + after.w / 2 - (event.clientX - rect.left - after.offX) / after.scale,
          cy: py + after.h / 2 - (event.clientY - rect.top - after.offY) / after.scale }, size) };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [level]);
  const startDrag = (event) => {
    if (event.button !== 0 || !svgRef.current) return;
    moved.current = false;
    const scale = frame(view, svgRef.current.getBoundingClientRect(), dims).scale;
    drag.current = { x: event.clientX, y: event.clientY, cx: view.cx, cy: view.cy, scale };
    const move = (e) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.hypot(dx, dy) > 4) moved.current = true;
      if (moved.current) setView((v) => clampView({ zoom: v.zoom, cx: d.cx - dx / d.scale, cy: d.cy - dy / d.scale }, dims));
    };
    const up = () => { drag.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const zoomBy = (factor) => setView((v) => clampView({ ...v, zoom: v.zoom * factor }, dims));
  const home = homeView(level);
  const busyLoading = !report;
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!busyLoading) return undefined;
    const started = Date.now();
    const tick = () => setSeconds(Math.floor((Date.now() - started) / 1000));
    const first = setTimeout(tick, 0), timer = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [busyLoading]);
  const stage = seconds < 4 ? 'Consultando la base de datos…' : seconds < 20 ? 'Calculando ventas, cargos y costos de cada envío…' : 'Armando el resumen guardado. Esta primera vez puede tardar unos minutos; después abre rápido.';
  const scope = report ? summary.count ? `${summary.count} envíos en la selección` : 'Sin envíos en este período' : 'Calculando el período…';
  const visibleZones = groupMap.has('__missing__') ? [...MAP_ZONES, '__missing__'] : MAP_ZONES;
  const colecta = filters.method !== 'flex';
  const what = country ? 'las provincias' : byPartido ? 'los partidos' : 'las zonas';
  const hoveredProvince = country && hovered ? groupMap.get(hovered) : null;
  return <div className={styles.dashboard}>
    {busyLoading ? <div className={styles.loadingBanner} role="status" aria-live="polite">
      <div className={styles.loadingTop}><span className={styles.spinner} aria-hidden="true" /><strong>Calculando el período…</strong><span className={styles.elapsed}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span></div>
      <div className={styles.loadingTrack}><span /></div>
      <p>{stage}</p>
    </div> : null}
    <div className={styles.kindHead} style={{ '--kind-color': kind === 'all' ? '#6ee7b7' : METHOD_COLORS[kind] }}><strong>{KIND_TITLES[kind][0]}</strong><span>{KIND_TITLES[kind][1]}</span>
      {report && refreshing ? <em className={styles.refreshPill} role="status"><i aria-hidden="true" />Actualizando…{report.cachedAt ? ` mostrando lo guardado a las ${new Date(report.cachedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : ''}</em> : null}</div>
    <section className={styles.period} aria-label="Período del mapa">
      <div className={styles.periodTop}><div><span className={styles.kicker}>01 · Elegí el período</span><h2>¿Qué período querés consultar?</h2></div><span className={styles.dateBasis}>Por fecha de despacho</span></div>
      <div className={styles.periodControls}><div className={styles.presets}>{PRESETS.map(([key, label]) => {
        const range = periodPreset(key);
        const active = (filters.from || '') === range.from && (filters.to || '') === range.to;
        return <button key={key} type="button" aria-pressed={active} onClick={() => onPeriod(range)}>{label}</button>;
      })}</div><div className={styles.dates}><label>Desde<input type="date" value={filters.from || ''} max={filters.to || undefined} onChange={(e) => onPeriod({ from: e.target.value, to: filters.to || '' })} /></label><span aria-hidden="true">→</span><label>Hasta<input type="date" value={filters.to || ''} min={filters.from || undefined} onChange={(e) => onPeriod({ from: filters.from || '', to: e.target.value })} /></label></div>
        <div className={styles.methodSwitch} role="group" aria-label="Mapa de envíos">{KINDS.map(([value, label]) => <button key={value} type="button" aria-pressed={kind === value} style={kind === value ? { background: value === 'all' ? `linear-gradient(90deg, ${METHOD_COLORS.flex}, ${METHOD_COLORS.colecta})` : METHOD_COLORS[value] } : undefined} onClick={() => onKind(value)}>{label}</button>)}</div>
</div>
    </section>
    {report && report.options?.noDispatchCount ? <p className={styles.coverage} role="note">{report.options.noDispatchCount} envíos todavía no tienen fecha de despacho confirmada, por eso no entran en ningún período.{report.syncTargets?.length ? ' Tocá “Actualizar datos” arriba para completarlos.' : ''}{report.dispatchMonths?.length ? ` Envíos con fecha de despacho por mes: ${report.dispatchMonths.map((m) => `${m.month.split('-').reverse().join('/')}: ${m.count}`).join(' · ')}.` : ''}</p> : null}
    <div className={styles.workspace}>
      <section className={styles.mapPanel} aria-label={`Selección de ${what} en el mapa`}>
        {kind !== 'flex' ? <nav className={styles.crumbs} aria-label="Nivel del mapa"><button type="button" aria-current={country ? 'page' : undefined} onClick={() => onLevel('argentina')}>Argentina</button><span aria-hidden="true">›</span><button type="button" aria-current={!country ? 'page' : undefined} onClick={() => onLevel('amba')}>AMBA</button></nav> : null}
        <div className={styles.mapHeading}><div><span className={styles.kicker}>02 · Marcá {what}</span><h2>{country ? 'Tu operación en el país' : 'Tu operación en el AMBA'}</h2><p>{country ? 'Marcá una o varias provincias. Doble clic en Buenos Aires, o el botón, para ver el detalle del AMBA.' : `Podés seleccionar más de ${byPartido ? 'uno' : 'una'}. Los importes se suman solos.`}</p></div>
          {!country ? <div className={styles.modeSwitch} role="group" aria-label="Tipo de selección"><button type="button" aria-pressed={!byPartido} onClick={() => onMode('zone')}>Por zona</button><button type="button" aria-pressed={byPartido} onClick={() => onMode('partido')}>Por partido</button></div> : <button type="button" className={styles.reset} onClick={() => onLevel('amba')}>Ver detalle AMBA</button>}
          <button type="button" className={styles.reset} aria-pressed={!chosen.length} onClick={() => country ? onProvinces([]) : byPartido ? onPartidos([]) : onSelect([])}>{country ? 'Todo el país' : byPartido ? 'Todos los partidos' : 'Todas las zonas'}</button></div>
        <div className={`${styles.mapCanvas} ${country ? styles.mapCanvasTall : ''}`}>
          <div className={styles.compass} aria-hidden="true">↑ <span>N</span></div>
          <div className={styles.zoom}><button type="button" aria-label="Acercar mapa" disabled={view.zoom >= MAX_ZOOM} onClick={() => zoomBy(1.5)}>+</button><button type="button" aria-label="Alejar mapa" disabled={view.zoom <= 1} onClick={() => zoomBy(1 / 1.5)}>−</button><button type="button" aria-label="Ver todo el mapa" disabled={view.zoom === 1 && view.cx === home.cx && view.cy === home.cy} onClick={() => setView(home)}>⌂</button></div>
          <svg ref={svgRef} viewBox={viewBox} className={styles.map} style={{ cursor: 'grab', touchAction: 'none' }} onPointerDown={startDrag} onClickCapture={(e) => { if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false; } }} aria-label={country ? 'Mapa de Argentina por provincia' : 'Mapa de CABA y partidos del Gran Buenos Aires'} role="group">
            <defs><pattern id="finance-map-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="currentColor" strokeOpacity=".04" /></pattern></defs>
            <rect x="-1000" y="-1000" width="3000" height="3000" fill="url(#finance-map-grid)" />
            {country ? provinceShapes.shapes.map((shape) => {
              const key = provinceKey(shape.name);
              const data = groupMap.get(key);
              const active = provinces.includes(key), muted = provinces.length > 0 && !active;
              const intensity = data?.count ? .25 + .75 * (data.count / maxProvince) : .06;
              const fill = methodColor(filters.method || '', data);
              const pick = () => toggleProvince(key);
              return <g key={shape.key} role="button" tabIndex={0} aria-label={`${provinceLabel(key)}: ${data?.count || 0} envíos`} aria-pressed={active} className={styles.zone} style={{ '--zone-color': fill, opacity: muted ? .3 : 1 }} onClick={pick} onDoubleClick={() => { if (AMBA_PROVINCES.includes(key)) onLevel('amba'); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }} onMouseEnter={() => setHovered(key)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(key)} onBlur={() => setHovered(null)}>
                <title>{provinceLabel(key)} · Flex {data?.flexCount || 0} · Colecta {data?.colectaCount || 0} · Ventas {money(data?.salesCents)}</title>
                <path d={shape.path} fillRule="evenodd" className={active ? styles.selectedPath : styles.provincePath} style={{ fillOpacity: active ? undefined : intensity }} />
              </g>;
            }) : byPartido ? shapes.shapes.map((shape) => {
              const keys = shapePartidoKeys(shape.name);
              const active = keys.some((key) => partidos.includes(key)), muted = partidos.length > 0 && !active;
              const data = combineZoneSummaries(report?.byPartido || [], keys);
              const label = shape.name.startsWith('Comuna ') ? `${shape.name} · CABA` : shape.name;
              return <g key={shape.name} role="button" tabIndex={0} aria-label={`Seleccionar ${label}`} aria-pressed={active} className={styles.zone} style={{ '--zone-color': ZONE_COLORS[shape.zone], opacity: muted ? .25 : 1 }} onClick={() => togglePartidos(keys)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePartidos(keys); } }} onMouseEnter={() => setHovered(shape.name)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(shape.name)} onBlur={() => setHovered(null)}>
                <title>{label} · {data.count} envíos · Ventas {money(data.salesCents)}</title>
                <path d={shape.path} fillRule="evenodd" className={active ? styles.selectedPath : styles.zonePath} />
              </g>;
            }) : MAP_ZONES.map((zone) => {
              const active = selected.includes(zone), muted = selected.length > 0 && !active;
              const data = groupMap.get(zone);
              return <g key={zone} role="button" tabIndex={0} aria-label={`Seleccionar ${zone}`} aria-pressed={active} className={styles.zone} style={{ '--zone-color': ZONE_COLORS[zone], opacity: muted ? .25 : 1 }} onClick={() => toggle(zone)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(zone); } }} onMouseEnter={() => setHovered(zone)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(zone)} onBlur={() => setHovered(null)}>
                <title>{zone} · {data?.count || 0} envíos · Ventas {money(data?.salesCents)}</title>
                {shapes.shapes.filter((shape) => shape.zone === zone).map((shape) => <path key={shape.name} d={shape.path} fillRule="evenodd" className={active ? styles.selectedPath : styles.zonePath}><title>{shape.name} · {zone}</title></path>)}
              </g>;
            })}
            {country ? provinceShapes.shapes.filter((shape) => provinceKey(shape.name) !== 'caba').map((shape) => {
              const data = groupMap.get(provinceKey(shape.name));
              const flexN = data?.flexCount || 0, colectaN = data?.colectaCount || 0, total = flexN + colectaN;
              const [x, y] = shape.label;
              return <g key={shape.key} className={styles.provinceTag}>
                <text x={x} y={y} className={styles.provinceLabel}>{provinceLabel(provinceKey(shape.name))}</text>
                {!filters.method && total ? <><rect x={x - 14} y={y + 3} width={28 * flexN / total} height={3.5} rx={1} fill={METHOD_COLORS.flex} /><rect x={x - 14 + 28 * flexN / total} y={y + 3} width={28 * colectaN / total} height={3.5} rx={1} fill={METHOD_COLORS.colecta} /></> : null}
                {total ? <text x={x} y={y + (filters.method ? 10 : 14)} className={styles.provinceCount}>{filters.method === 'flex' ? flexN : filters.method === 'colecta' ? colectaN : `${flexN} · ${colectaN}`}</text> : null}
              </g>;
            }) : null}
            {!country && !byPartido && shapes.labels.map(({ zone, point }) => <text key={zone} x={point[0]} y={point[1]} className={styles.zoneLabel} style={{ fill: ZONE_COLORS[zone] }}>{zone}</text>)}
            {!country ? <text x={shapes.river[0]} y={shapes.river[1]} className={styles.river} transform={`rotate(-32 ${shapes.river[0]} ${shapes.river[1]})`}>RÍO DE LA PLATA</text> : null}
          </svg>
          {country ? <div className={styles.methodLegend} aria-label="Referencias">{filters.method !== 'colecta' ? <span><i style={{ background: METHOD_COLORS.flex }} />Flex</span> : null}{filters.method !== 'flex' ? <span><i style={{ background: METHOD_COLORS.colecta }} />Colecta</span> : null}<small>{filters.method ? 'Más intenso = más envíos' : 'El color mezcla Flex y Colecta según cuántos envíos tiene cada una; la barra muestra la proporción'}</small></div> : null}
          <div className={styles.mapHint} aria-live="polite">{hovered ? country ? <><i style={{ background: methodColor(filters.method || '', hoveredProvince) }} /><strong>{provinceLabel(hovered)}</strong>{filters.method !== 'colecta' ? <span style={{ color: METHOD_COLORS.flex }}>Flex {hoveredProvince?.flexCount || 0}</span> : null}{filters.method !== 'flex' ? <span style={{ color: METHOD_COLORS.colecta }}>Colecta {hoveredProvince?.colectaCount || 0}</span> : null}<span>Ventas {money(hoveredProvince?.salesCents)}</span></> : byPartido ? <HoverPartido name={hovered} report={report} /> : <><i style={{ background: ZONE_COLORS[hovered] }} /><strong>{hovered}</strong><span>{groupMap.get(hovered)?.count || 0} envíos</span><span>Ventas {money(groupMap.get(hovered)?.salesCents)}</span></> : <span>Hacé clic para seleccionar · arrastrá para mover · rueda para acercar</span>}</div>
        </div>
        {country || byPartido ? <div className={styles.partidoPicker}>
          <label className={styles.partidoSearch}>Buscar {country ? 'provincia' : 'partido'}<input type="search" value={search} placeholder={country ? 'Ej.: Córdoba, Santa Fe…' : 'Ej.: Quilmes, La Matanza…'} onChange={(e) => setSearch(e.target.value)} /></label>
          {chosen.length ? <div className={styles.chips} aria-label="Selección">{chosen.map((key) => <button key={key} type="button" onClick={() => country ? toggleProvince(key) : togglePartidos([key])}>{labelOf(key)} <span aria-hidden="true">×</span></button>)}</div> : null}
          <div className={styles.partidoList}>{[...(country ? visibleProvinces.map((p) => ({ ...p, zone: '' })) : visiblePartidos), ...(showMissing ? [{ key: '__missing__', zone: '', label: labelOf('__missing__') }] : [])].map((p) => {
            const count = (country ? groupMap.get(p.key) : partidoGroups.get(p.key))?.count || 0;
            return <button key={p.key} type="button" aria-pressed={chosen.includes(p.key)} onClick={() => country ? toggleProvince(p.key) : togglePartidos([p.key])} style={{ '--zone-color': country ? methodColor(filters.method || '', groupMap.get(p.key)) : ZONE_COLORS[p.zone] || ZONE_COLORS.__missing__ }}><i /><span>{p.label}</span><small>{count} envíos</small><b>{chosen.includes(p.key) ? '✓' : '+'}</b></button>;
          })}</div>
        </div> : <div className={styles.zoneLegend}>{visibleZones.map((zone) => {
          const g = groupMap.get(zone);
          return <button key={zone} type="button" aria-pressed={selected.includes(zone)} onClick={() => toggle(zone)} style={{ '--zone-color': ZONE_COLORS[zone] }}><i /><span>{zone === '__missing__' ? 'Sin zona' : zone}</span><small>{g?.count || 0} envíos</small><b>{selected.includes(zone) ? '✓' : '+'}</b></button>;
        })}</div>}
        <details className={styles.mapSource}><summary>Cómo se agrupan</summary><p>En el AMBA se usan las zonas operativas de la app; La Matanza está dividida en Norte (GBA 1) y Sur (GBA 2). {colecta ? 'Con Colecta o Todo, el AMBA muestra solo los envíos de CABA y la provincia de Buenos Aires; los de Buenos Aires fuera del AMBA quedan como “Sin zona”.' : ''} En el país, cada envío va a la provincia de su dirección de entrega.</p><p>Geometrías: {shapes.attribution} (AMBA) y {provinceShapes.attribution} (provincias). La selección solo filtra la consulta.</p></details>
      </section>
      <aside className={styles.summary} aria-label="Resumen de la selección" aria-busy={loading}>
        <div className={styles.summaryHead}><span className={styles.kicker}>03 · Tu resumen automático</span><h2>{selectionName}</h2><p role="status">{scope}</p></div>
        <div className={styles.sales}><span>Ventas brutas pagadas</span><strong>{report ? money(summary.salesCents) : '—'}</strong><small>{summary.paidOrderCount} pedidos pagados · {summary.count - summary.salesUnavailableCount} de {summary.count} registros con importe de venta</small></div>
        <div className={styles.summaryGrid}><Stat label="Gasto logístico" value={report && summary.knownCount ? money(summary.totalCents) : '—'} /><Stat label="Envíos" value={report ? summary.count : '—'} note={report && !filters.method ? <><b style={{ color: METHOD_COLORS.flex }}>Flex {summary.flexCount}</b> · <b style={{ color: METHOD_COLORS.colecta }}>Colecta {summary.colectaCount}</b></> : null} /><Stat label="Costo promedio / envío" value={money(summary.averageCents)} /><Stat label="Venta promedio / pedido" value={money(summary.averageSaleCents)} /></div>
        <dl className={styles.costs}><div><dt>Cargos de Mercado Libre</dt><dd>{report && summary.feesCount ? money(summary.feesCents) : '—'}</dd></div><div><dt>Saldo con importes conocidos</dt><dd>{report && summary.netAfterShippingCount ? money(summary.netAfterShippingCents) : '—'}</dd></div></dl>
        <div className={styles.coverage}>Ventas brutas + envío cobrado en Tiendanube − cargos de ML − gasto logístico.<small>Saldo provisional: se conservan todas las ventas conocidas aunque falten costos. {summary.missingCount || 0} envíos sin costo; {summary.feesUnavailableCount || 0} envíos con cargos de ML incompletos; {summary.salesUnavailableCount || 0} sin importe de venta.{summary.salesMissingCount ? ` ${summary.salesMissingCount} pedidos con venta no computable.` : ''} No incluye costo de mercadería, retenciones ni comisiones de otros canales.</small></div>
        <div className={styles.ratio}><span>Gasto sobre ventas</span><strong>{percent(summary.logisticsPercent)}</strong><div className={styles.ratioTrack}><span style={{ width: `${Math.min(100, summary.logisticsPercent || 0)}%` }} /></div><small>{summary.comparableCount} de {summary.count} envíos con venta completa y costo de envío conocido</small></div>
        <dl className={styles.costs}>{filters.method !== 'colecta' ? <div><dt>Gasto Flex</dt><dd>{report && summary.knownCount ? money(summary.flexCents) : '—'}</dd></div> : null}{colecta ? <><div><dt>Gasto Colecta · Mercado Libre</dt><dd>{report && summary.knownCount ? money(summary.colectaMlCents) : '—'}</dd></div><div><dt>Costo de envío · Tiendanube</dt><dd>{summary.tiendanubeCostCount ? money(summary.tiendanubeCostCents) : '—'}</dd></div><div><dt>Envío cobrado al cliente · Tiendanube</dt><dd>{summary.shippingCollectedCount ? money(summary.shippingCollectedCents) : '—'}</dd></div></> : null}</dl>
        {colecta ? <div className={styles.coverage}>Tiendanube: {summary.shippingCollectedCount || 0} pedidos con cargo de envío informado.{summary.shippingCollectedMissingCount ? <span> {summary.shippingCollectedMissingCount} sin importe de envío; actualizá los datos.</span> : null}<small>El envío cobrado al cliente se separa de la venta de mercadería. Solo se computa como costo lo informado por Tiendanube para el vendedor.</small></div> : null}
        {summary.missingCount || summary.salesMissingCount || summary.salesUnavailableCount ? <div className={styles.coverage}>{summary.missingCount} envíos sin costo · {summary.salesUnavailableCount} sin importe de venta.{summary.salesMissingCount ? <span> {summary.salesMissingCount} pedidos con venta no computable.</span> : null}<small>Los promedios usan solo los importes conocidos.</small></div> : null}
        <button type="button" className={styles.detailButton} onClick={onDetail}>Ver detalle de estos envíos <span aria-hidden="true">↗</span></button>
      </aside>
    </div>
    <section className={styles.breakdown} aria-label="Totales del período">
      <div className={styles.breakdownHead}><span className={styles.kicker}>Totales del período</span><h2>{country ? 'Todas las provincias' : byPartido ? 'Todos los partidos' : 'Todas las zonas'}, lado a lado</h2></div>
      <div className={styles.breakdownScroll}><table><thead><tr><th>{country ? 'Provincia' : byPartido ? 'Partido' : 'Zona'}</th><th>Envíos</th><th>Ventas brutas</th><th>Cargos ML</th><th>Gasto logístico</th><th>Saldo provisional</th><th>Gasto / ventas</th></tr></thead>
        <tbody>{rowsByName.map((g) => <tr key={g.name}><th scope="row">{g.label}</th><td>{g.count}</td><td>{money(g.salesCents)}</td><td>{g.feesCount ? money(g.feesCents) : '—'}</td><td>{g.knownCount ? money(g.totalCents) : '—'}</td><td>{g.netAfterShippingCount ? money(g.netAfterShippingCents) : '—'}</td><td>{percent(g.logisticsPercent)}</td></tr>)}</tbody>
        <tfoot><tr><th scope="row">Total</th><td>{allSummary.count}</td><td>{money(allSummary.salesCents)}</td><td>{allSummary.feesCount ? money(allSummary.feesCents) : '—'}</td><td>{allSummary.knownCount ? money(allSummary.totalCents) : '—'}</td><td>{allSummary.netAfterShippingCount ? money(allSummary.netAfterShippingCents) : '—'}</td><td>{percent(allSummary.logisticsPercent)}</td></tr></tfoot></table></div>
    </section>
    <p className={styles.footnote}>Ventas de mercadería de Mercado Libre y Tiendanube del período de despacho, en ARS brutos. El cargo de envío del checkout de Tiendanube se muestra separado y no se suma otra vez a las ventas. Los cargos de Mercado Libre son la comisión y el costo de financiación; no incluyen retenciones, devoluciones parciales ni el costo de la mercadería. Costos de envío: Flex según tus tarifas; Colecta según lo que cobra Mercado Libre; Tiendanube según el costo informado en el pedido. Los importes faltantes quedan pendientes. Los pedidos de Tiendanube sin fecha de despacho no entran en el período.</p>
  </div>;
}

function HoverPartido({ name, report }) {
  const data = combineZoneSummaries(report?.byPartido || [], shapePartidoKeys(name));
  return <><strong>{name.startsWith('Comuna ') ? `${name} · CABA` : name}</strong><span>{data.count} envíos</span><span>Ventas {money(data.salesCents)}</span></>;
}
function Stat({ label, value, note = null }) { return <div><span>{label}</span><strong>{value}</strong>{note ? <small className={styles.statNote}>{note}</small> : null}</div>; }
