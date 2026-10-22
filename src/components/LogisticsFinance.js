"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { ZONE_ORDER } from '@/lib/zoneGroups';
import { partidoLabel, provinceLabel } from '@/lib/financeMap';
import { STATE_LABELS, toCents, deliveryEventLabel, settlementMatrix, settlementMatrixCsv } from '@/lib/logisticsFinance';
import { getArgentinaDateString, formatArgentinaDateTime } from '@/lib/dateUtils';
import styles from './LogisticsFinance.module.css';

const money = (cents) => cents === null || cents === undefined ? '—' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(cents / 100);
const percent = (value) => value === null || value === undefined ? '—' : `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value)} %`;
const when = (value) => !value ? 'No disponible' : /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : formatArgentinaDateTime(value);
const statusNames = { draft: 'Abierta', closed: 'Cerrada', paid: 'Pagada' };
const keyOf = (r) => `${r.connectionId}:${r.shipmentId}`;
const endpoint = '/logistics-finance';
const blankMap = (level) => ({ selection: [], partidos: [], mode: 'zone', provinces: [], level });
// The last map summary of each query is kept in this browser, so the page opens with numbers while it refreshes.
const cacheKey = (workspaceId, query) => `geomodi-finance-map:v8:${workspaceId ?? ''}:${query}`;
function readCache(key) { try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch { return null; } }
function writeCache(key, data) { try { window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* Storage full or blocked: the page still works. */ } }
const FinanceMapDashboard = dynamic(() => import('./FinanceMapDashboard'), { loading: () => <div role="status">Cargando mapa…</div> });

export default function LogisticsFinance({ currentUser, delivery = false }) {
  const [tab, setTab] = useState('map');
  const [mapKindChoice, setMapKind] = useState('all');
  const [maps, setMaps] = useState({ flex: blankMap('amba'), colecta: blankMap('argentina'), all: blankMap('argentina') });
  const [filters, setFilters] = useState(() => delivery ? {} : { from: `${getArgentinaDateString().slice(0, 7)}-01`, to: getArgentinaDateString() });
  const [loadedReport, setReport] = useState(null);
  const [rates, setRates] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const sequence = useRef(0);
  const canEdit = currentUser?.isGlobalAdmin || ['admin', 'owner'].includes(currentUser?.role);
  const mapKind = tab === 'map' ? mapKindChoice : null;
  const mapView = !delivery && Boolean(mapKind);
  const ms = maps[mapKind || 'flex'];
  const setMs = (patch) => setMaps((prev) => ({ ...prev, [mapKind]: { ...prev[mapKind], ...patch } }));
  const mapMethod = mapKind === 'all' ? '' : mapKind || '';
  // With Colecta in view, the AMBA map covers only CABA and Buenos Aires province; the rest of the country is on the Argentina map.
  const mapScope = mapView && ms.level === 'amba' && mapMethod !== 'flex' ? { provinces: 'caba,buenos_aires' } : {};
  const baseFilters = mapView ? { from: filters.from, to: filters.to, method: mapMethod } : filters;
  const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(baseFilters).filter(([, value]) => value)), ...mapScope }).toString();
  const mapChoice = ms.level === 'argentina' ? (ms.provinces.length ? { provinces: ms.provinces.join(',') } : {})
    : ms.mode === 'partido' ? (ms.partidos.length ? { partidos: ms.partidos.join(',') } : {}) : (ms.selection.length ? { zones: ms.selection.join(',') } : {});
  const exportQuery = mapView ? new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(query)), ...mapChoice }).toString() : query;
  const report = loadedReport?.queryKey === `${mapView}:${query}` ? loadedReport : null;
  const openMapDetail = () => { setFilters({ ...Object.fromEntries(new URLSearchParams(query)), ...mapChoice }); setPage(1); setSelected(null); setTab('stats'); };
  const workspaceId = currentUser?.workspaceId;
  const load = useCallback(async (force = false) => {
    const id = ++sequence.current;
    const key = cacheKey(workspaceId, query), queryKey = `${mapView}:${query}`;
    if (mapView) {
      const cached = readCache(key);
      setReport((current) => current?.queryKey === queryKey || !cached ? current : { ...cached.data, queryKey, cachedAt: cached.savedAt });
    }
    setRefreshing(true);
    try {
      const data = await api(`${endpoint}?${query}${mapView ? '&view=map' : delivery ? '' : '&view=detail'}${force === true ? '&refresh=1' : ''}`);
      if (id === sequence.current) { setReport({ ...data, queryKey }); setError(''); setLoading(false); setRefreshing(false); }
      if (mapView) writeCache(key, data);
      return data;
    } catch (err) { if (id === sequence.current) { setError(err.message); setLoading(false); setRefreshing(false); } return null; }
  }, [query, mapView, workspaceId, delivery]);
  const loadConfig = useCallback(async () => {
    const [r, c, s] = await Promise.all([api(`${endpoint}?view=rates`), api('/carriers'), api(`${endpoint}?view=settlements`)]);
    setRates(r.rates); setCarriers(c); setSettlements(s.settlements);
  }, []);
  useEffect(() => { load(); const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60_000); return () => { clearInterval(timer); }; }, [load]);
  useEffect(() => { loadConfig().catch((err) => setError(err.message)); }, [loadConfig]);
  useEffect(() => { if (selected) document.getElementById('shipment-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [selected]);
  const change = (key, value) => { setFilters((prev) => ({ ...prev, [key]: value })); setPage(1); setSelected(null); };
  const mutate = async (input) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api(endpoint, { method: 'POST', body: JSON.stringify(input) });
      // Rates only change the rates list right away; the heavy report refreshes in the background.
      if (input.action === 'rates') { load(); await loadConfig(); } else await Promise.all([load(), loadConfig()]);
      if (input.action === 'draft') window.dispatchEvent(new Event('settlement-jobs-refresh'));
      if (input.id || result.id) setDetail(await api(`${endpoint}?view=settlements&id=${input.id || result.id}`));
      setMessage('Cambios guardados.');
      return true;
    } catch (err) { setError(err.message); return false; } finally { setBusy(false); }
  };
  const [opening, setOpening] = useState(null);
  const [jobs, setJobs] = useState({});
  const jobsRef = useRef({}), detailIdRef = useRef(null);
  detailIdRef.current = detail?.settlement.id ?? null;
  useEffect(() => {
    const onJobs = (e) => {
      const prev = jobsRef.current, next = Object.fromEntries(e.detail.map((j) => [j.settlementId, j]));
      const ended = Object.values(prev).filter((j) => j.status === 'running' && next[j.settlementId]?.status !== 'running').map((j) => j.settlementId);
      jobsRef.current = next; setJobs(next);
      // A search that just ended refreshes the list and the open settlement.
      if (ended.length) {
        loadConfig().catch(() => {});
        if (ended.includes(detailIdRef.current)) api(`${endpoint}?view=settlements&id=${detailIdRef.current}`).then(setDetail).catch(() => {});
      }
    };
    window.addEventListener('settlement-jobs', onJobs);
    return () => window.removeEventListener('settlement-jobs', onJobs);
  }, [loadConfig]);
  const searchAgain = async (id) => {
    setSettlementError('');
    try { await api(`${endpoint}/jobs`, { method: 'POST', body: JSON.stringify({ action: 'fetch', id }) }); window.dispatchEvent(new Event('settlement-jobs-refresh')); }
    catch (err) { setSettlementError(err.message); }
  };
  const [settlementError, setSettlementError] = useState('');
  // Opens a settlement, or downloads its day × zone table straight away.
  const openSettlement = async (id, then = 'show') => {
    setSettlementError(''); setOpening(`${then}:${id}`);
    try {
      const data = await api(`${endpoint}?view=settlements&id=${id}`);
      if (then === 'download') downloadSettlement(data); else { setDetail(data); setTimeout(() => document.getElementById('settlement-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }
    } catch (err) { setSettlementError(`No se pudo abrir la liquidación #${id}: ${err.message}`); } finally { setOpening(null); }
  };
  // Pulls every Mercado Libre order of the period (with its sale amount and fees), page by page with real progress.
  const syncOrders = async () => {
    const plan = await api(`${endpoint}/sync`, { method: 'POST', body: JSON.stringify({ mode: 'plan' }) });
    const day = (value, shift) => { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + shift); return date.toISOString().slice(0, 10); };
    // Orders are created a few days before their dispatch day.
    const dateFrom = filters.from ? `${day(filters.from, -5)}T00:00:00.000-03:00` : '';
    const dateTo = filters.to ? `${day(filters.to, 1)}T23:59:59.999-03:00` : '';
    if (!plan.connections.length) throw new Error('No hay cuentas de Mercado Libre conectadas o su acceso venció. Reconectá la cuenta desde Integraciones.');
    const totals = { saved: 0, failed: 0, found: 0 };
    for (const [index, account] of plan.connections.entries()) {
      let offset = 0, total = null, saved = 0;
      while (true) {
        setProgress({ label: `Ventas de Mercado Libre${plan.connections.length > 1 ? ` · cuenta ${index + 1} de ${plan.connections.length}` : ''}`, done: offset, total });
        const page = await api(`${endpoint}/sync`, { method: 'POST', body: JSON.stringify({ mode: 'orders', connectionId: account.connectionId, offset, dateFrom, dateTo }) });
        total = page.total ?? total; saved += page.synced; offset = page.nextOffset; totals.saved += page.synced; totals.failed += page.failed;
        if (page.done || (total !== null && offset >= total) || offset >= 10000) break;
      }
      totals.found += total ?? offset;
      setProgress({ label: `Ventas de Mercado Libre · ${saved} órdenes guardadas`, done: total ?? offset, total: total ?? offset });
    }
    for (const account of plan.tiendanubeConnections || []) {
      let page = 1;
      while (true) {
        setProgress({ label: 'Pedidos y envíos cobrados · Tiendanube', done: (page - 1) * 50, total: null });
        const result = await api(`${endpoint}/sync`, { method: 'POST', body: JSON.stringify({ mode: 'tiendanube', connectionId: account.connectionId, page }) });
        totals.tiendanube = (totals.tiendanube || 0) + result.synced;
        if (result.done) break;
        page = result.nextPage;
      }
    }
    return totals;
  };
  const sync = async () => {
    setBusy(true); setError(''); let failed = 0;
    try {
      let orderTotals = null, source = report;
      if (mapView) {
        orderTotals = await syncOrders();
        // Show the new sales right away; the slower per-shipment details continue afterwards.
        setProgress({ label: 'Recalculando el resumen con las ventas nuevas…', done: 0, total: 0 });
        await load(true);
        source = await api(`${endpoint}?${query}&view=targets`);
        // Labels with no Mercado Libre order yet: look each one up by its shipment number.
        const labels = source?.labelTargets || [];
        if (labels.length) {
          let found = 0;
          for (let i = 0; i < labels.length; i += 10) {
            setProgress({ label: 'Buscando en Mercado Libre la venta de cada etiqueta', done: i, total: labels.length });
            const result = await api(`${endpoint}/sync`, { method: 'POST', body: JSON.stringify({ mode: 'labels', trackings: labels.slice(i, i + 10) }) });
            found += result.results.filter((r) => r.ok).length;
          }
          orderTotals.labels = { found, total: labels.length };
          setProgress({ label: 'Recalculando el resumen…', done: 0, total: 0 });
          await load(true);
          source = await api(`${endpoint}?${query}&view=targets`);
        }
      }
      const rows = (source?.rows || source?.syncTargets || []).filter((r) => r.source !== 'tiendanube' && !String(r.shipmentId || '').startsWith('tn:') && r.orderId && r.connectionId);
      if (!rows.length && !mapView) { setMessage('No hay envíos pendientes de actualizar desde Mercado Libre.'); return; }
      const orderNote = orderTotals ? `Mercado Libre devolvió ${orderTotals.found} órdenes del período: ${orderTotals.saved} guardadas${orderTotals.failed ? `, ${orderTotals.failed} con error` : ''}.${orderTotals.tiendanube ? ` Tiendanube: ${orderTotals.tiendanube} pedidos.` : ''}${orderTotals.labels ? ` Etiquetas sin venta: ${orderTotals.labels.found} de ${orderTotals.labels.total} encontradas en Mercado Libre.` : ''} ` : '';
      if (orderNote) setMessage(`${orderNote}Completando el detalle de ${rows.length} envíos…`);
      // Three batches of 10 at a time, newest shipments first.
      let next = 0, done = 0;
      const worker = async () => {
        while (next < rows.length) {
          const start = next; next += 10;
          const result = await api(`${endpoint}/sync`, { method: 'POST', body: JSON.stringify({ orders: rows.slice(start, start + 10).map(({ orderId, connectionId }) => ({ orderId, connectionId })) }) });
          failed += result.results.filter((r) => !r.ok).length;
          done = Math.min(rows.length, done + 10);
          setProgress({ label: 'Completando el detalle de cada envío', done, total: rows.length });
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      await load(mapView);
      setMessage(`${orderNote}${rows.length - failed} envíos actualizados.${failed ? ` ${failed} con errores; se conservaron sus últimos datos y se reintentarán.` : ''}`);
    } catch (err) { setError(err.message); } finally { setBusy(false); setProgress(null); }
  };
  const summary = report?.summary || {};
  const rows = report?.rows || [];
  const selectedRow = rows.find((r) => keyOf(r) === selected);
  const shown = rows.slice((page - 1) * 50, page * 50);
  return <div className={`section ${styles.page}`}>
    <header className={styles.header}><div><p className={styles.eyebrow}>{delivery ? 'Seguimiento · Mercado Libre' : 'Administración · ARS'}</p><h1>{delivery ? 'Control de entregas' : mapView ? 'Ventas y costos por zona' : 'Ventas, costos y liquidaciones'}</h1><p>{delivery ? 'Cada envío, su plazo y sus incidencias. Los datos se consultan localmente cada 60 segundos.' : mapView ? 'Elegí un período y seleccioná zonas. El resumen se calcula automáticamente.' : 'Ventas y gasto logístico por zona y partido. Tarifas Flex y liquidaciones de transportistas.'}</p></div><div className={styles.actions}><button className="btn btn-primary" disabled={busy || loading} onClick={sync}>{busy ? 'Actualizando…' : mapView ? 'Actualizar datos' : 'Actualizar desde Mercado Libre'}</button><a className="btn btn-ghost" href={`/api${endpoint}?${exportQuery}${delivery ? '' : '&view=detail'}&format=csv`}>Exportar CSV</a></div></header>
    {progress ? <div className={styles.progress} role="status" aria-live="polite"><div className={styles.progressTop}><strong>{progress.label}</strong><span>{progress.total ? `${Math.min(progress.done, progress.total)} de ${progress.total}` : `${progress.done}…`}</span></div><div className={styles.progressTrack}><span style={{ width: progress.total ? `${Math.min(100, Math.round(progress.done / progress.total * 100))}%` : '8%' }} /></div></div> : null}
    {error ? <div role="alert" className={`${styles.notice} ${styles.error}`}>{error}</div> : null}
    {message ? <div role="status" className={styles.notice}>{message}</div> : null}
    {!delivery ? <nav className={styles.tabs} aria-label="Ventas y costos"><button aria-pressed={tab === 'map'} onClick={() => setTab('map')}>Mapa de zonas</button><button aria-pressed={tab === 'stats'} onClick={() => tab !== 'stats' && openMapDetail()}>Detalle</button><button aria-pressed={tab === 'rates'} onClick={() => setTab('rates')}>Tarifas por zona</button><button aria-pressed={tab === 'settlements'} onClick={() => setTab('settlements')}>Liquidaciones</button></nav> : null}
    {mapView ? <FinanceMapDashboard key={mapKind} kind={mapKind} onKind={setMapKind} report={report} refreshing={refreshing} filters={{ ...filters, method: mapMethod }} selected={ms.selection} onSelect={(selection) => setMs({ selection })} partidos={ms.partidos} onPartidos={(partidos) => setMs({ partidos })} mode={ms.mode} onMode={(mode) => setMs({ mode })} provinces={ms.provinces} onProvinces={(provinces) => setMs({ provinces })} level={ms.level} onLevel={(level) => setMs({ level })} onPeriod={(range) => { setFilters((prev) => ({ ...prev, ...range })); setPage(1); }} onDetail={openMapDetail} /> : null}
    {delivery || tab === 'stats' ? <>
      {!delivery && filters.provinces ? <div className={styles.notice}>Provincias seleccionadas: {filters.provinces.split(',').map(provinceLabel).join(' + ')}. <button className={styles.link} onClick={() => change('provinces', '')}>Ver todas</button></div> : null}
      {!delivery && filters.partidos ? <div className={styles.notice}>Partidos seleccionados: {filters.partidos.split(',').map(partidoLabel).join(' + ')}. <button className={styles.link} onClick={() => change('partidos', '')}>Ver todos</button></div> : null}
      {!delivery && filters.zones ? <div className={styles.notice}>Zonas seleccionadas: {filters.zones.replaceAll('__missing__', 'Sin zona').replaceAll(',', ' + ')}. <button className={styles.link} onClick={() => change('zones', '')}>Ver todas</button></div> : null}
      <div className={styles.panel}><Filters filters={filters} change={change} carriers={carriers} report={report} delivery={delivery} /><p className={styles.muted}>{delivery ? 'Fechas opcionales. Sin período se incluyen también los envíos antiguos abiertos.' : 'Período según fecha de despacho confirmada. Los envíos sin fecha se ven quitando el período.'} <button className={styles.link} onClick={() => { setFilters({}); setPage(1); }}>Quitar filtros</button></p></div>
      <div className={styles.metrics}>{delivery ? <>
        <Metric label="Envíos" value={summary.count || 0} note="En la selección" /><Metric label="Con demora" value={summary.delayed || 0} note="Informada por ML o plazo vencido" /><Metric label="Incidencias" value={summary.incidents || 0} note="Intentos fallidos y problemas" /><Metric label="Entregados" value={rows.filter((r) => r.state === 'delivered').length} note="Confirmados por Mercado Libre" />
      </> : <><Metric label="Gasto conocido" value={money(summary.totalCents)} note={`${summary.knownCount || 0} envíos con importe`} /><Metric label="Envíos" value={summary.count || 0} note="En la selección" /><Metric label="Sin costo" value={summary.missingCount || 0} note="Importes pendientes" /><Metric label="Promedio por envío" value={money(summary.averageCents)} note="Solo envíos con importe conocido" /></>}</div>
      {!delivery ? <><div className={styles.metrics}><Metric label="Ventas brutas pagadas" value={money(summary.salesCents)} note={`${summary.paidOrderCount || 0} pedidos pagados · ARS`} /><Metric label="Gasto / ventas" value={percent(summary.logisticsPercent)} note={`${summary.comparableCount || 0} envíos con ventas y costo completos`} /><Metric label="Flex" value={money(summary.flexCents)} note="Gasto logístico Flex" /><Metric label="Colecta" value={money(summary.colectaCents)} note="Gasto logístico Colecta" /></div><p className={styles.muted}>Ventas de mercadería de pedidos pagados de Mercado Libre y Tiendanube, agrupadas por despacho. El envío cobrado en Tiendanube se muestra separado. No descuentan comisiones, impuestos ni devoluciones parciales. {summary.salesMissingCount || 0} pedidos con venta no computable; {summary.salesUnavailableCount || 0} envíos sin importe de venta. El porcentaje usa solo envíos con ventas y costo completos.</p></> : null}
      {!delivery ? <div className={styles.notice}><strong>{summary.count || 0} envíos · {summary.missingCount || 0} sin importe.</strong> Flex en curso: {money(summary.estimatedFlexCents)}. Entregados aún sin liquidar: {money(summary.payableFlexCents)}. Son partes del gasto Flex, no importes adicionales.{report?.options.noDispatchCount ? <p>{report.options.noDispatchCount} envíos sin despacho confirmado en el espacio ({report.options.unmatchedCount} sin vínculo con Mercado Libre). Quitá el período para revisarlos.</p> : null}</div> : null}
      {!delivery ? <div className={styles.breakdown}><GroupTable title={filters.zone ? `Partidos · ${filters.zone === '__missing__' ? 'Sin zona' : filters.zone}` : 'Por zona'} groups={filters.zone ? report?.byPartido : report?.byZone} onChoose={(name) => change(filters.zone ? 'partido' : 'zone', name === 'Sin dato' ? '__missing__' : name)} /><GroupTable title="Transportistas Flex" groups={report?.byCarrier} onChoose={(name) => { const carrier = carriers.find((c) => (c.display_name || c.name) === name); change('carrierId', carrier ? String(carrier.id) : '__missing__'); }} /></div> : null}
      <section className={styles.panel}><h2>{delivery ? 'Seguimiento de envíos' : filters.partido ? `Envíos · ${filters.partido === '__missing__' ? 'Sin partido' : filters.partido.replaceAll('_',' ')}` : 'Detalle de envíos'}</h2>{loading || !report ? <div className={styles.empty} role="status">Cargando envíos…</div> : <ShipmentTable rows={shown} delivery={delivery} onSelect={(r) => setSelected(keyOf(r))} />}<div className={styles.footer}><span>{rows.length} envíos · página {page} de {Math.max(1, Math.ceil(rows.length / 50))}</span><div className={styles.actions}><button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><button className="btn btn-ghost btn-sm" disabled={page * 50 >= rows.length} onClick={() => setPage(page + 1)}>Siguiente</button></div></div></section>
      {selectedRow ? <ShipmentDetail key={keyOf(selectedRow)} row={selectedRow} full={delivery} onClose={() => setSelected(null)} /> : null}
    </> : null}
    {!delivery && tab === 'rates' ? <RatesPanel carriers={carriers} rates={rates} canEdit={canEdit} busy={busy} onSave={mutate} /> : null}
    {!delivery && tab === 'settlements' ? <>
      <section className={styles.panel}><h2>Liquidaciones por transportista</h2><p className={styles.muted}>Período según fecha de entrega confirmada por Mercado Libre. Mientras está abierta se recalcula con cada entrega nueva; al cerrarla queda fija.</p>{canEdit ? <DraftForm carriers={carriers} busy={busy} onSave={mutate} /> : null}<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Número</th><th>Transportista</th><th>Entregas entre</th><th>Estado</th><th className={styles.number}>Importe cerrado + ajustes</th><th /></tr></thead><tbody>{settlements.map((s) => <tr key={s.id}><td>#{s.id}</td><td>{s.carrier_name}</td><td>{when(s.date_from)} — {when(s.date_to)}</td><td><span className={styles.badge}>{statusNames[s.status]}</span><JobStatus job={jobs[s.id]} onRetry={canEdit && s.status === 'draft' ? () => searchAgain(s.id) : null} /></td><td className={styles.number}>{s.status === 'draft' ? '—' : money(Number(s.total_cents) + Number(s.adjustments_cents))}</td><td><div className={styles.actions}><button className="btn btn-primary btn-sm" disabled={Boolean(opening)} onClick={() => openSettlement(s.id, 'download')}>{opening === `download:${s.id}` ? 'Preparando…' : 'Descargar'}</button><button className="btn btn-ghost btn-sm" disabled={Boolean(opening)} onClick={() => openSettlement(s.id)}>{opening === `show:${s.id}` ? 'Abriendo…' : 'Revisar'}</button></div></td></tr>)}</tbody></table>{!settlements.length ? <p className={styles.empty}>Todavía no hay liquidaciones.</p> : null}</div>{settlementError ? <div role="alert" className={`${styles.notice} ${styles.error}`}>{settlementError}</div> : null}</section>
      {detail ? <SettlementDetail job={jobs[detail.settlement.id]} detail={detail} canEdit={canEdit} busy={busy} onSave={mutate} onClose={() => setDetail(null)} /> : null}
    </> : null}
  </div>;
}

function Metric({ label, value, note }) { return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
function Select({ label, value, onChange, options, all = 'Todos' }) { return <label>{label}<select value={value || ''} onChange={(e) => onChange(e.target.value)}><option value="">{all}</option>{options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select></label>; }
function Filters({ filters, change, carriers, report, delivery }) {
  return <div className={styles.filters}><label>Despacho desde<input type="date" value={filters.from || ''} onChange={(e) => change('from', e.target.value)} /></label><label>Despacho hasta<input type="date" value={filters.to || ''} onChange={(e) => change('to', e.target.value)} /></label>
    <Select label="Cuenta" value={filters.connectionId} onChange={(v) => change('connectionId', v)} options={(report?.options.connections || []).map((id) => { const seller = report.rows.find((r) => r.connectionId === id)?.sellerId; return [id, seller ? `Cuenta ${seller}` : `Conexión ${id}`]; })} />
    <Select label="Modalidad" value={filters.method} onChange={(v) => change('method', v)} options={['flex','colecta'].map((v) => [v, v === 'flex' ? 'Flex' : 'Colecta'])} />
    <Select label="Transportista" value={filters.carrierId} onChange={(v) => change('carrierId', v)} options={[...carriers.map((c) => [c.id, c.display_name || c.name]), ['__missing__','Sin transportista']]} />
    <Select label="Zona" value={filters.zone} onChange={(v) => change('zone', v)} options={[...ZONE_ORDER.map((v) => [v,v]), ['__missing__','Sin zona']]} />
    <Select label="Partido" value={filters.partido} onChange={(v) => change('partido', v)} options={[...(report?.options.parties || []).map((v) => [v,v.replaceAll('_',' ')]), ['__missing__','Sin partido']]} />
    <Select label="Estado de entrega" value={filters.state} onChange={(v) => change('state', v)} options={Object.entries(STATE_LABELS)} />
    {delivery ? <Select label="Alertas" value={filters.alert} onChange={(v) => change('alert', v)} options={[['delayed','Demorados / vencidos'],['today','Entrega prevista hoy'],['incident','Incidencias']]} /> : null}
  </div>;
}
function GroupTable({ title, groups = [], onChoose }) { return <section className={styles.panel}><h2>{title}</h2><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Grupo</th><th className={styles.number}>Envíos</th><th className={styles.number}>Ventas brutas</th><th className={styles.number}>Gasto conocido</th><th className={styles.number}>Gasto / ventas</th><th className={styles.number}>Sin costo / venta</th></tr></thead><tbody>{groups.map((g) => <tr key={g.name}><td><button className={styles.link} onClick={() => onChoose(g.name)}>{g.name.replaceAll('_',' ')}</button></td><td className={styles.number}>{g.count}</td><td className={styles.number}>{money(g.salesCents)}<small>{g.paidOrderCount || 0} pedidos pagados</small></td><td className={styles.number}>{money(g.totalCents)}</td><td className={styles.number}>{percent(g.logisticsPercent)}</td><td className={styles.number}>{g.missingCount} / {g.salesUnavailableCount || 0}</td></tr>)}</tbody></table>{!groups.length ? <p className={styles.empty}>Sin envíos para estos filtros.</p> : null}</div></section>; }
function ShipmentTable({ rows, delivery = false, onSelect = null }) {
  return <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Envío / comprador</th><th>Modalidad / transportista</th><th>Zona / partido</th><th>Estado</th>{delivery ? <><th>Entrega estimada</th><th>Entrega real</th><th>Última consulta completa</th></> : <><th>Despacho</th><th className={styles.number}>Ventas brutas</th><th className={styles.number}>Envío cobrado TN</th><th className={styles.number}>Gasto</th></>}<th /></tr></thead><tbody>{rows.map((r) => <tr key={keyOf(r)}><td>{r.shipmentId}<small>{r.recipient}</small></td><td>{r.method === 'flex' ? 'Flex' : 'Colecta'}<small>{r.carrierName || 'Sin transportista propio'}</small></td><td>{r.zone || 'Sin zona'}<small>{r.partido?.replaceAll('_',' ') || 'Sin partido'}</small></td><td><span className={`${styles.badge} ${r.state === 'delivered' ? styles.success : ''}`}>{r.stateLabel}</span>{r.delayed ? <span className={`${styles.badge} ${styles.warning}`}>Demora informada por ML</span> : null}{r.overdue ? <span className={`${styles.badge} ${styles.warning}`}>Plazo vencido</span> : null}{delivery && r.history[0] ? <small>{deliveryEventLabel(r.history[0])} · {when(r.history[0].date)}</small> : null}{r.stale ? <small>Datos desactualizados</small> : null}</td>{delivery ? <><td>{when(r.estimatedDay)}</td><td>{when(r.deliveredAt)}</td><td>{when(r.syncedAt)}</td></> : <><td>{when(r.dispatchDay)}</td><td className={styles.number}>{money(r.salesCents)}<small>{r.paidOrderCount || 0} pedidos pagados{r.salesMissingCount ? ` · ${r.salesMissingCount} sin computar` : ""}</small></td><td className={styles.number}>{money(r.shippingCollectedCents)}</td><td className={styles.number}>{money(r.amountCents)}<small>{r.missing || (r.settlementId ? `Liquidación #${r.settlementId}` : '')}</small></td></>}<td>{onSelect ? <button className={styles.link} onClick={() => onSelect(r)}>Detalle</button> : null}</td></tr>)}</tbody></table>{!rows.length ? <p className={styles.empty}>No hay envíos para esta selección.</p> : null}</div>;
}
// The summary rows carry no history; the full record of one shipment is read when it is opened.
function ShipmentDetail({ row, full, onClose }) {
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    if (full || !row.connectionId) return;
    api(`${endpoint}?view=shipment&connectionId=${row.connectionId}&shipmentId=${encodeURIComponent(row.shipmentId)}`).then(setLoaded).catch(() => setLoaded({}));
  }, [row.connectionId, row.shipmentId, full]);
  const r = { history: [], ...row, ...(loaded || {}) };
  return <section className={`${styles.panel} ${styles.detail}`} id="shipment-detail" aria-label="Detalle de envío"><div className={styles.actions}><h2>Envío {r.shipmentId}</h2><button className="btn btn-ghost btn-sm" onClick={onClose}>Cerrar detalle</button></div>{r.syncError ? <div className={`${styles.notice} ${styles.error}`}>Última consulta con errores: {r.syncError}. Se conserva el último dato válido.</div> : null}<dl className={styles.facts}>{[['Estado Mercado Libre',r.stateLabel],['Entrega estimada',when(r.estimatedDay)],['Entrega real',when(r.deliveredAt)],['Incidencia',r.incidentReason || 'Sin incidencia informada'],['Última consulta completa',when(r.syncedAt)],['Costo actualizado',when(r.costsSyncedAt)],['Preparación interna',r.internalImportedAt ? `Etiqueta importada: ${when(r.internalImportedAt)}` : 'Sin etiqueta importada'],['Impresión interna',when(r.internalPrintedAt)],['Tarifa aplicada',r.rateId ? `#${r.rateId} · ${money(r.amountCents)}` : r.missing || money(r.amountCents)]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><h2>Historial de Mercado Libre</h2><ol className={styles.timeline}>{r.history.map((e,i) => <li key={`${e.date}:${i}`}>{deliveryEventLabel(e)}<time>{when(e.date)}</time></li>)}</ol>{!r.history.length ? <p className={styles.muted}>{!full && row.connectionId && !loaded ? 'Cargando historial…' : 'Mercado Libre no informó historial.'}</p> : null}</section>;
}
function currentRate(rates, carrierId, zone, day) {
  return rates.filter((r) => Number(r.carrier_id) === Number(carrierId) && r.zone === zone && r.valid_from <= day)
    .sort((x, y) => y.valid_from.localeCompare(x.valid_from) || Number(y.id) - Number(x.id))[0] || null;
}
function RatesPanel({ carriers, rates, canEdit, busy, onSave }) {
  const today = getArgentinaDateString();
  const [open, setOpen] = useState(null);
  const [values, setValues] = useState({});
  const [from, setFrom] = useState(today);
  const [history, setHistory] = useState(false);
  const toggle = (id) => { setOpen(open === id ? null : id); setValues({}); setFrom(today); setHistory(false); };
  const day = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : today;
  const shown = (carrierId, zone) => { if (values[zone] !== undefined) return values[zone]; const r = currentRate(rates, carrierId, zone, day); return r ? String(Number(r.amount_cents) / 100) : ''; };
  // Every filled zone is saved with the chosen date; re-saving an existing date just corrects it.
  const toSave = (carrierId) => ZONE_ORDER.filter((zone) => shown(carrierId, zone) !== '' && true);
  const save = async (carrier) => {
    const ok = await onSave({ action: 'rates', rates: toSave(carrier.id).map((zone) => ({ carrierId: Number(carrier.id), zone, validFrom: from, amountCents: toCents(shown(carrier.id, zone)) })) });
    if (ok) setValues({});
  };
  return <section className={`${styles.panel} ${styles.ratesPanel}`}>
    <h2>Precio de envío por transportista</h2>
    <p className={styles.muted}>Tocá un transportista para ver y cambiar su precio en las 4 zonas. Cada envío usa el precio vigente el día de su despacho.</p>
    {!canEdit ? <p className={styles.muted}>Solo administradores pueden modificar tarifas.</p> : null}
    <div className={styles.carrierList}>{carriers.map((c) => {
      const isOpen = open === c.id;
      const dirty = toSave(c.id).length > 0;
      const validFrom = /^\d{4}-\d{2}-\d{2}$/.test(from);
      const clash = validFrom && toSave(c.id).some((zone) => rates.some((r) => Number(r.carrier_id) === Number(c.id) && r.zone === zone && r.valid_from === from));
      const own = rates.filter((r) => Number(r.carrier_id) === Number(c.id)).sort((x, y) => y.valid_from.localeCompare(x.valid_from) || Number(y.id) - Number(x.id));
      return <div key={c.id} className={`${styles.carrierCard} ${isOpen ? styles.carrierOpen : ''}`}>
        <button type="button" className={styles.carrierHead} aria-expanded={isOpen} onClick={() => toggle(c.id)}>
          <strong>{c.display_name || c.name}</strong>
          <span className={styles.zonePreview}>{ZONE_ORDER.map((zone) => { const r = currentRate(rates, c.id, zone, today); return <span key={zone} className={r ? '' : styles.noRate}>{zone} <b>{r ? money(Number(r.amount_cents)) : 'sin precio'}</b></span>; })}</span>
          <span aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
        </button>
        {isOpen ? <div className={styles.zoneEditor}>
          <div className={styles.zoneGrid}>{ZONE_ORDER.map((zone) => { const r = currentRate(rates, c.id, zone, day); return <label key={zone} className={styles.zoneField}><span>{zone}</span><small>{r ? `${day === today ? 'Hoy' : when(day)}: ${money(Number(r.amount_cents))}${r.valid_from === day ? ' · cargado' : ''}` : 'Sin precio cargado'}</small><input type="number" min="0" step="0.01" inputMode="decimal" disabled={!canEdit || busy} placeholder="0,00" value={shown(c.id, zone)} onChange={(e) => setValues((prev) => ({ ...prev, [zone]: e.target.value }))} /></label>; })}</div>
          {canEdit ? <div className={styles.saveRow}>
            <label>Nuevo precio vigente desde<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setValues({}); }} /></label>
            <button type="button" className="btn btn-primary" disabled={busy || !dirty || !validFrom} onClick={() => save(c)}>{busy ? 'Guardando…' : 'Guardar precios'}</button>
          </div> : null}
          {!validFrom ? <p className={styles.muted}>Elegí una fecha de vigencia válida.</p> : clash ? <p className={styles.muted}>Ya hay un precio cargado con esa fecha para alguna zona: se va a corregir con el valor nuevo.</p> : <p className={styles.muted}>Cambiá el precio de las zonas que quieras y tocá Guardar. Al guardar se cargan los 4 precios que ves con la fecha elegida; si esa fecha ya tenía precio, se corrige.</p>}
          {own.length ? <><button type="button" className={styles.link} onClick={() => setHistory(!history)}>{history ? 'Ocultar historial de precios' : 'Ver historial de precios'}</button>
            {history ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Zona</th><th>Vigente desde</th><th className={styles.number}>Por envío</th></tr></thead><tbody>{own.map((r) => <tr key={r.id}><td>{r.zone}</td><td>{when(r.valid_from)}</td><td className={styles.number}>{money(Number(r.amount_cents))}</td></tr>)}</tbody></table></div> : null}</> : null}
        </div> : null}
      </div>;
    })}</div>
    {!carriers.length ? <p className={styles.empty}>Todavía no hay transportistas cargados.</p> : null}
  </section>;
}
function DraftForm({ carriers, busy, onSave }) { return <form className={styles.form} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); onSave({ action:'draft', carrierId:Number(f.get('carrier')), from:f.get('from'), to:f.get('to') }); }}><label>Transportista<select required name="carrier"><option value="">Elegir…</option>{carriers.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}</select></label><label>Entregado desde<input type="date" name="from" required defaultValue={`${getArgentinaDateString().slice(0,7)}-01`} /></label><label>Entregado hasta<input type="date" name="to" required defaultValue={getArgentinaDateString()} /></label><button className="btn btn-primary" disabled={busy}>Crear liquidación</button></form>; }
// Built in the browser from the settlement data, as a CSV that Excel opens directly.
function jobLabel(job) {
  const p = job.progress || {};
  if (job.phase === 'orders') return `ventas: ${p.orders || 0}${p.ordersTotal ? ` de ${p.ordersTotal}` : ''}`;
  if (job.phase === 'labels') return `etiquetas sin venta: ${p.labels || 0}${p.labelsTotal ? ` de ${p.labelsTotal}` : ''}`;
  return 'recalculando';
}
function JobStatus({ job, onRetry }) {
  if (job?.status === 'running') return <small>Buscando envíos · {jobLabel(job)}</small>;
  if (job?.status === 'error') return <small>No se pudo buscar: {job.error}{onRetry ? <> <button className={styles.link} onClick={onRetry}>Reintentar</button></> : null}</small>;
  return onRetry ? <small><button className={styles.link} onClick={onRetry}>Buscar envíos de nuevo</button></small> : null;
}
function downloadSettlement({ settlement: s, items, adjustments }) {
  const url = URL.createObjectURL(new Blob([settlementMatrixCsv(settlementMatrix(items, ZONE_ORDER), adjustments)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = `liquidacion-${s.id}-${s.carrier_name || 'transportista'}-${s.date_from}_${s.date_to}.csv`.replace(/[^\w.-]+/g, '-');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function SettlementMatrix({ matrix, adjustments, totalCents }) {
  const { zones, days, total } = matrix;
  return <div className={styles.tableWrap}><table className={styles.table}>
    <thead><tr><th>Día</th>{zones.map((z) => <th key={z} className={styles.number}>{z}</th>)}<th className={styles.number}>Paquetes</th><th className={styles.number}>Total</th></tr></thead>
    <tbody>{days.map((d) => <tr key={d.day}><td>{when(d.day)}</td>{zones.map((z) => <td key={z} className={styles.number}>{d.counts[z] || '—'}</td>)}<td className={styles.number}>{d.count}</td><td className={styles.number}>{money(d.totalCents)}</td></tr>)}</tbody>
    <tfoot>
      <tr><th>Total paquetes</th>{zones.map((z) => <th key={z} className={styles.number}>{total.counts[z]}</th>)}<th className={styles.number}>{total.count}</th><th /></tr>
      <tr><th>Total $</th>{zones.map((z) => <th key={z} className={styles.number}>{money(total.cents[z])}</th>)}<th /><th className={styles.number}>{money(total.totalCents)}</th></tr>
      {adjustments.map((a) => <tr key={a.id}><td colSpan={zones.length + 2}>Ajuste: {a.reason}</td><td className={styles.number}>{money(Number(a.amount_cents))}</td></tr>)}
      {adjustments.length ? <tr><th colSpan={zones.length + 2}>Total a pagar</th><th className={styles.number}>{money(totalCents)}</th></tr> : null}
    </tfoot>
  </table></div>;
}
function SettlementDetail({ detail, job, canEdit, busy, onSave, onClose }) {
  const { settlement:s, items, adjustments, totalCents, excluded = {} } = detail;
  const matrix = settlementMatrix(items, ZONE_ORDER);
  return <section className={`${styles.panel} ${styles.detail}`} id="settlement-detail"><div className={styles.actions}><h2>Liquidación #{s.id} · {statusNames[s.status]}</h2><button className="btn btn-primary btn-sm" disabled={!items.length} onClick={() => downloadSettlement(detail)}>Descargar Excel</button><a className="btn btn-ghost btn-sm" href={`/api${endpoint}?view=settlements&id=${s.id}&format=csv`}>Detalle por envío</a><button className="btn btn-ghost btn-sm" onClick={onClose}>Cerrar detalle</button></div><p className={styles.muted}>{items.length} entregados · {when(s.date_from)} al {when(s.date_to)} · Total {money(totalCents)}</p>
    {job?.status === 'running' ? <div className={styles.notice} role="status">Buscando en Mercado Libre los envíos del período ({jobLabel(job)}). Te avisamos cuando esté lista; podés seguir usando la app.</div> : null}
    {Object.keys(excluded).length ? <div className={styles.notice}><strong>Quedan afuera:</strong> {Object.entries(excluded).map(([reason, n]) => `${n} ${reason.toLowerCase()}`).join(' · ')}.{excluded['Sin tarifa'] ? ' Cargá el precio vigente desde el inicio del período en «Tarifas por zona».' : ''}</div> : null}
    {items.length ? <SettlementMatrix matrix={matrix} adjustments={adjustments} totalCents={totalCents} /> : <p className={styles.empty}>No hay envíos Flex entregados con tarifa para este transportista en el período.</p>}
    <details><summary className={styles.link}>Ver envío por envío ({items.length})</summary><ShipmentTable rows={items} /></details>
    {adjustments.map((a) => <p className={styles.muted} key={a.id}>Ajuste: {money(Number(a.amount_cents))} · {a.reason} · {when(a.created_at)}</p>)}
    {s.status === 'paid' ? <div className={styles.notice}>Pagada el {when(s.paid_at)}. Referencia: {s.payment_reference || 'Sin referencia'}.</div> : null}
    {canEdit && s.status === 'draft' ? <div className={styles.notice}><p>Revisá los envíos y el importe antes de cerrar. El cierre reserva cada envío y congela su tarifa.</p><button className="btn btn-primary" disabled={busy || !items.length} onClick={() => onSave({ action:'close', id:s.id })}>Cerrar liquidación · {money(totalCents)}</button></div> : null}
    {canEdit && s.status === 'closed' ? <><h2>Registrar pago</h2><form className={styles.form} onSubmit={(e) => { e.preventDefault(); const f=new FormData(e.currentTarget); onSave({ action:'pay', id:s.id, paidAt:f.get('date'), reference:f.get('reference') }); }}><label>Fecha de pago<input required type="date" name="date" defaultValue={getArgentinaDateString()} /></label><label>Referencia opcional<input name="reference" maxLength={500} placeholder="Transferencia, comprobante…" /></label><button disabled={busy} className="btn btn-primary">Marcar pagada · {money(totalCents)}</button></form><h2>Ajuste con motivo</h2><form className={styles.form} onSubmit={(e) => { e.preventDefault(); const f=new FormData(e.currentTarget); onSave({ action:'adjust', id:s.id, amountCents:toCents(f.get('amount')), reason:f.get('reason') }); }}><label>Importe ARS (+ / −)<input required type="number" step="0.01" name="amount" /></label><label>Motivo<input required name="reason" maxLength={1000} /></label><button disabled={busy} className="btn btn-ghost">Agregar ajuste</button></form></> : null}
  </section>;
}
