"use client";
import { useCallback, useEffect, useState } from 'react';
import { getArgentinaDateString, formatArgentinaDateTime } from '@/lib/dateUtils';
import { FINANCE_ZONES } from '@/lib/shippingFinance';
import styles from './FinanceSection.module.css';

const money = cents => cents === null ? 'Pendiente' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(cents / 100);
const stateNames = { delivered: 'Entregado', shipped: 'En tránsito', in_transit: 'En tránsito', ready_to_ship: 'Listo para despachar', pending: 'Pendiente', handling: 'En preparación', not_delivered: 'No entregado', cancelled: 'Cancelado', canceled: 'Cancelado' };
async function read(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Error de conexión');
  return data;
}
export default function FinanceSection({ mode = 'analysis', canManage = false, demo = null }) {
  const today = getArgentinaDateString();
  const [filters, setFilters] = useState({ from: today.slice(0, 8) + '01', to: today, modality: '', carrier: '', connection: '', region: '' });
  const [report, setReport] = useState(null);
  const [rates, setRates] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState({ carrier: '', effectiveFrom: today, prices: Object.fromEntries(FINANCE_ZONES.map(z => [z, ''])) });
  const [variation, setVariation] = useState(0);
  const [stateFilter, setStateFilter] = useState('');
  const load = useCallback(async signal => {
    setLoading(true); setError('');
    try {
      if (demo) {
        setReport(demo.report(filters)); setRates(demo.rates); setCarriers(demo.carriers);
      } else {
        const [nextReport, nextRates, nextCarriers] = await Promise.all([
          read(`/api/finance/report?${new URLSearchParams(filters)}`, { signal }),
          read('/api/finance/rates', { signal }), read('/api/carriers', { signal }),
        ]);
        setReport(nextReport); setRates(nextRates); setCarriers(nextCarriers);
      }
    } catch (e) { if (e.name !== 'AbortError') setError(e.message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [filters, demo]);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    // Refresh the view; ML notifications remain the source of live updates.
    const interval = mode !== 'rates' && !demo ? setInterval(() => load(controller.signal), 60000) : null;
    return () => { controller.abort(); if (interval) clearInterval(interval); };
  }, [load, mode, demo]);
  async function save(event) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      await read('/api/finance/rates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      setNotice('Tarifas guardadas. Los cargos anteriores conservan su importe.'); await load();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  async function sync() {
    setSyncing(true); setError(''); setNotice('');
    try {
      let offset = 0, synced = 0, failed = 0, rounds = 0;
      do {
        const result = await read('/api/finance/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...filters, offset }) });
        synced += result.synced; failed += result.failures.length; offset = result.nextOffset; rounds++;
        setNotice(`Sincronizando: ${synced} ventas actualizadas…`);
      } while (offset !== null && rounds < 20);
      setNotice(`${synced} ventas actualizadas.${failed ? ` ${failed} consultas fallaron; volvé a sincronizar.` : ''}${offset !== null ? ' Hay más ventas: reducí el rango para completar la consulta.' : ''}`);
      await load();
    } catch (e) { setError(e.message); } finally { setSyncing(false); }
  }
  function filter(key, value) { setFilters(previous => ({ ...previous, [key]: value, ...(key === 'modality' ? { region: '' } : {}) })); }
  const rows = report?.packages || [];
  const totals = report?.totals;
  const knownFlex = rows.filter(p => p.modality === 'flex' && p.costCents !== null && (!filters.from || p.costDate >= filters.from) && (!filters.to || p.costDate <= filters.to)).reduce((n, p) => n + p.costCents, 0);
  const visible = rows.filter(p => !stateFilter || (stateFilter === 'delayed' ? p.delayed : p.status === stateFilter));
  const regions = [...new Set((report?.groups || []).map(g => g.region))];
  return <section className={styles.root}>
    <header className={styles.header}><div><span className={styles.eyebrow}>CONTROL LOGÍSTICO · ARS</span><h2>{mode === 'rates' ? 'Tarifas por transportista' : mode === 'tracking' ? 'Control de entregas' : 'Ventas y costos'}</h2><p>{mode === 'rates' ? 'Un precio por paquete entregado. Programá cada cambio con su fecha de vigencia.' : 'Mirada territorial de tus ventas, costos y cumplimiento de entregas.'}</p></div><button type="button" disabled={loading} onClick={() => load()}>{loading ? 'Actualizando…' : 'Actualizar'}</button></header>
    {demo ? <p className={styles.banner}>Vista de prueba · datos ficticios · los cambios no se guardan.</p> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {notice ? <p role="status" className={styles.banner}>{notice}</p> : null}
    {mode === 'rates' ? <>
      {canManage ? <form onSubmit={save} className={styles.panel}>
        <div className={styles.filters}><label>Transportista<select required value={form.carrier} onChange={e => setForm({ ...form, carrier: e.target.value })}><option value="">Seleccionar</option>{carriers.map(c => <option key={c.name} value={c.name}>{c.display_name || c.name}</option>)}</select></label><label>Vigente desde<input type="date" required value={form.effectiveFrom} onChange={e => setForm({ ...form, effectiveFrom: e.target.value })} /></label>{FINANCE_ZONES.map(zone => <label key={zone}>{zone} · ARS<input type="number" required min="0" step="0.01" value={form.prices[zone]} onChange={e => setForm({ ...form, prices: { ...form.prices, [zone]: e.target.value } })} /></label>)}</div>
        <button disabled={saving || Boolean(demo)}>{saving ? 'Guardando…' : 'Guardar tarifas'}</button><p className={styles.caption}>Para aplicar desde hoy, elegí hoy. Guardar la misma fecha actualiza esa vigencia. Los cargos ya registrados no se recalculan.</p>
      </form> : <p className={styles.caption}>Las tarifas pueden ser modificadas por un administrador del workspace.</p>}
      <div className={styles.panel}><h3>Historial de tarifas</h3><div className={styles.scroll}><table><thead><tr><th>Transportista</th><th>Zona</th><th>Vigente desde</th><th>Por paquete</th></tr></thead><tbody>{rates.map(r => <tr key={r.id}><td>{r.carrier_name}</td><td>{r.zone}</td><td>{r.effective_from}</td><td>{money(Number(r.amount_cents))}</td></tr>)}</tbody></table></div>{!rates.length ? <p>No hay tarifas cargadas. Agregá primero un transportista en Config. Zonas.</p> : null}</div>
    </> : <>
      <div className={styles.filters}>
        <label>Desde<input type="date" value={filters.from} onChange={e => filter('from', e.target.value)} /></label><label>Hasta<input type="date" value={filters.to} onChange={e => filter('to', e.target.value)} /></label>
        <label>Modalidad<select value={filters.modality} onChange={e => filter('modality', e.target.value)}><option value="">Todas</option><option value="flex">Flex</option><option value="colecta">Colecta</option><option value="otros">Otras</option></select></label>
        <label>Transportista<select value={filters.carrier} onChange={e => filter('carrier', e.target.value)}><option value="">Todos</option>{carriers.map(c => <option key={c.name}>{c.name}</option>)}</select></label>
        <label>Cuenta ML<select value={filters.connection} onChange={e => filter('connection', e.target.value)}><option value="">Todas</option>{(report?.connections || []).map(c => <option key={c.id} value={c.id}>{c.display_name || c.external_store_id || `Cuenta ${c.id}`}</option>)}</select></label>
        <label>Zona / provincia<select value={filters.region} onChange={e => filter('region', e.target.value)}><option value="">Todas</option>{[...new Set([...regions, ...(filters.region ? [filters.region] : [])])].map(r => <option key={r}>{r}</option>)}</select></label>
      </div>
      {!demo ? <div><button type="button" disabled={syncing || loading || !filters.from || !filters.to} onClick={sync}>{syncing ? 'Consultando Mercado Libre…' : 'Sincronizar ventas del rango'}</button><p className={styles.caption}>Consulta ventas creadas en estas fechas y actualiza sus envíos y costos. Para entregas de ventas anteriores, ampliá el rango de sincronización.</p></div> : null}
      {totals ? <div className={styles.metrics}>{[['Ventas pagadas', money(totals.salesCents)], ['Costo registrado', money(totals.costCents)], ['Paquetes entregados', totals.delivered], ['Costos pendientes', totals.pendingCosts], ['Entregas demoradas', totals.delayed]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div> : null}
      <p className={styles.caption}>Ventas por fecha de venta · costo Flex por fecha de entrega · costo Colecta por creación del envío. Ventas pagadas brutas: no representan facturación fiscal ni resultado neto. {report?.unknownSales ? `${report.unknownSales} ventas sin importe ARS disponible.` : ''}</p>
      {mode === 'analysis' ? <><div className={styles.panel}><h3>Distribución por zona y provincia</h3><div className={styles.scroll}><table><thead><tr><th>Destino</th><th>Modalidad</th><th>Ventas</th><th>Costo</th><th>Costo / ventas*</th><th>Pendientes</th></tr></thead><tbody>{report?.groups.map(g => <tr key={`${g.modality}:${g.region}`}><td>{g.region}</td><td>{g.modality}</td><td>{money(g.salesCents)}</td><td>{money(g.costCents)}</td><td>{g.salesCents ? `${(g.costCents / g.salesCents * 100).toFixed(1)}%` : '—'}</td><td>{g.pendingCosts}</td></tr>)}</tbody></table></div><p className={styles.caption}>*Relación de totales del período con bases de fecha distintas. No es margen. Costos pendientes excluidos del importe registrado.</p></div>
        <div className={styles.simulator}><div><span className={styles.eyebrow}>SIMULACIÓN FLEX</span><h3>Probá un cambio de tarifa</h3><p>Solo paquetes con costo conocido dentro del período.</p></div><label>Variación porcentual<input type="number" min="-100" max="1000" value={variation} onChange={e => setVariation(Math.max(-100, Math.min(1000, Number(e.target.value))))} /></label><strong>{money(Math.round(knownFlex * (1 + variation / 100)))}</strong><span>Diferencia {money(Math.round(knownFlex * variation / 100))}</span></div></> : null}
      <div className={styles.panel}><div className={styles.header}><h3>Detalle de entregas y costos</h3><label>Estado<select value={stateFilter} onChange={e => setStateFilter(e.target.value)}><option value="">Todos</option><option value="delayed">Demorados</option>{Object.entries(stateNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div><div className={styles.scroll}><table><thead><tr><th>Paquete / cuenta</th><th>Destino</th><th>Transportista</th><th>Estado</th><th>Costo</th><th>Última sincronización</th><th>Historial</th></tr></thead><tbody>{visible.map(p => <tr key={p.key}><td>{p.shipmentId || 'Sin envío'}<small>Cuenta {p.connectionId}</small></td><td>{p.modality === 'flex' ? p.zone || 'Sin zona' : p.province}</td><td>{p.carrier || '—'}</td><td><span className={p.delayed ? styles.warn : styles.badge}>{stateNames[p.status] || p.status}</span>{p.delayed ? <small className={styles.warn}>Fuera de plazo</small> : null}<small>{p.substatus}</small></td><td>{money(p.costCents)}<small>{p.costReason || p.costDate}</small></td><td>{formatArgentinaDateTime(p.syncedAt, { hour12: false })}</td><td><details><summary>Ver eventos</summary>{p.deadline ? <p>Plazo: {formatArgentinaDateTime(p.deadline, { hour12: false })}</p> : <p>Sin plazo informado</p>}{p.history.length ? p.history.map((event, i) => <p key={i}>{stateNames[event.status] || event.status} · {event.substatus} · {formatArgentinaDateTime(event.date, { hour12: false })}</p>) : <p>Sin historial disponible</p>}</details></td></tr>)}</tbody></table></div>{!visible.length ? <p>{loading ? 'Cargando datos…' : 'No hay paquetes para este período y filtros. Sincronizá tus cuentas de Mercado Libre.'}</p> : null}</div>
    </>}
  </section>;
}
