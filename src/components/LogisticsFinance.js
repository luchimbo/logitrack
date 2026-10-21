"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { ZONE_ORDER } from '@/lib/zoneGroups';
import { STATE_LABELS, toCents, deliveryEventLabel } from '@/lib/logisticsFinance';
import { getArgentinaDateString, formatArgentinaDateTime } from '@/lib/dateUtils';
import styles from './LogisticsFinance.module.css';

const money = (cents) => cents === null || cents === undefined ? '—' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(cents / 100);
const percent = (value) => value === null || value === undefined ? '—' : `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value)} %`;
const when = (value) => !value ? 'No disponible' : /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : formatArgentinaDateTime(value);
const statusNames = { draft: 'Borrador', closed: 'Cerrada', paid: 'Pagada' };
const keyOf = (r) => `${r.connectionId}:${r.shipmentId}`;
const endpoint = '/logistics-finance';

export default function LogisticsFinance({ currentUser, delivery = false }) {
  const [tab, setTab] = useState('stats');
  const [filters, setFilters] = useState(() => delivery ? {} : { from: `${getArgentinaDateString().slice(0, 7)}-01`, to: getArgentinaDateString() });
  const [report, setReport] = useState(null);
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
  const sequence = useRef(0);
  const canEdit = currentUser?.isGlobalAdmin || ['admin', 'owner'].includes(currentUser?.role);
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const load = useCallback(async () => {
    const id = ++sequence.current;
    try {
      const data = await api(`${endpoint}?${query}`);
      if (id === sequence.current) { setReport(data); setLoading(false); }
    } catch (err) { if (id === sequence.current) { setError(err.message); setLoading(false); } }
  }, [query]);
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
      await Promise.all([load(), loadConfig()]);
      if (input.id || result.id) setDetail(await api(`${endpoint}?view=settlements&id=${input.id || result.id}`));
      setMessage('Cambios guardados.');
      return true;
    } catch (err) { setError(err.message); return false; } finally { setBusy(false); }
  };
  const openSettlement = async (id) => { setError(''); try { setDetail(await api(`${endpoint}?view=settlements&id=${id}`)); } catch (err) { setError(err.message); } };
  const sync = async () => {
    const rows = (report?.rows || []).filter((r) => r.orderId && r.connectionId);
    if (!rows.length) { setMessage('No hay envíos en la selección para actualizar.'); return; }
    setBusy(true); setError(''); let failed = 0;
    try {
      for (let i = 0; i < rows.length; i += 10) {
        setMessage(`Consultando Mercado Libre: ${i} de ${rows.length} envíos…`);
        const result = await api(`${endpoint}/sync`, { method: 'POST', body: JSON.stringify({ orders: rows.slice(i, i + 10).map(({ orderId, connectionId }) => ({ orderId, connectionId })) }) });
        failed += result.results.filter((r) => !r.ok).length;
      }
      await load();
      setMessage(`${rows.length - failed} envíos actualizados.${failed ? ` ${failed} con errores; se conservaron sus últimos datos y se reintentarán.` : ''}`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const summary = report?.summary || {};
  const rows = report?.rows || [];
  const selectedRow = rows.find((r) => keyOf(r) === selected);
  const shown = rows.slice((page - 1) * 50, page * 50);
  return <div className={`section ${styles.page}`}>
    <header className={styles.header}><div><p className={styles.eyebrow}>{delivery ? 'Seguimiento · Mercado Libre' : 'Administración · ARS'}</p><h1>{delivery ? 'Control de entregas' : 'Ventas, costos y liquidaciones'}</h1><p>{delivery ? 'Cada envío, su plazo y sus incidencias. Los datos se consultan localmente cada 60 segundos.' : 'Ventas y gasto logístico por zona y partido. Tarifas Flex y liquidaciones de transportistas.'}</p></div><div className={styles.actions}><button className="btn btn-primary" disabled={busy || loading} onClick={sync}>{busy ? 'Actualizando…' : 'Actualizar desde Mercado Libre'}</button><a className="btn btn-ghost" href={`/api${endpoint}?${query}&format=csv`}>Exportar CSV</a></div></header>
    {error ? <div role="alert" className={`${styles.notice} ${styles.error}`}>{error}</div> : null}
    {message ? <div role="status" className={styles.notice}>{message}</div> : null}
    {!delivery ? <nav className={styles.tabs} aria-label="Costos"><button aria-pressed={tab === 'stats'} onClick={() => setTab('stats')}>Estadísticas</button><button aria-pressed={tab === 'rates'} onClick={() => setTab('rates')}>Tarifas por zona</button><button aria-pressed={tab === 'settlements'} onClick={() => setTab('settlements')}>Liquidaciones</button></nav> : null}
    {delivery || tab === 'stats' ? <>
      <div className={styles.panel}><Filters filters={filters} change={change} carriers={carriers} report={report} delivery={delivery} /><p className={styles.muted}>{delivery ? 'Fechas opcionales. Sin período se incluyen también los envíos antiguos abiertos.' : 'Período según fecha de despacho confirmada. Los envíos sin fecha se ven quitando el período.'} <button className={styles.link} onClick={() => { setFilters({}); setPage(1); }}>Quitar filtros</button></p></div>
      <div className={styles.metrics}>{delivery ? <>
        <Metric label="Envíos" value={summary.count || 0} note="En la selección" /><Metric label="Con demora" value={summary.delayed || 0} note="Informada por ML o plazo vencido" /><Metric label="Incidencias" value={summary.incidents || 0} note="Intentos fallidos y problemas" /><Metric label="Entregados" value={rows.filter((r) => r.state === 'delivered').length} note="Confirmados por Mercado Libre" />
      </> : <><Metric label="Gasto conocido" value={money(summary.totalCents)} note={`${summary.knownCount || 0} envíos con importe`} /><Metric label="Envíos" value={summary.count || 0} note="En la selección" /><Metric label="Sin costo" value={summary.missingCount || 0} note="Importes pendientes" /><Metric label="Promedio por envío" value={money(summary.averageCents)} note="Solo envíos con importe conocido" /></>}</div>
      {!delivery ? <><div className={styles.metrics}><Metric label="Ventas brutas pagadas" value={money(summary.salesCents)} note={`${summary.paidOrderCount || 0} pedidos pagados · ARS`} /><Metric label="Gasto / ventas" value={percent(summary.logisticsPercent)} note={`${summary.comparableCount || 0} envíos con ventas y costo completos`} /><Metric label="Flex" value={money(summary.flexCents)} note="Gasto logístico Flex" /><Metric label="Colecta" value={money(summary.colectaCents)} note="Gasto logístico Colecta" /></div><p className={styles.muted}>Ventas brutas de pedidos pagados de Mercado Libre, agrupadas por el despacho de sus envíos. No descuentan comisiones, impuestos ni devoluciones parciales. {summary.salesMissingCount || 0} pedidos con venta no computable; {summary.salesUnavailableCount || 0} envíos sin importe de venta. El porcentaje usa solo envíos con ventas y costo completos.</p></> : null}
      {!delivery ? <div className={styles.notice}><strong>{summary.count || 0} envíos · {summary.missingCount || 0} sin importe.</strong> Flex en curso: {money(summary.estimatedFlexCents)}. Entregados aún sin liquidar: {money(summary.payableFlexCents)}. Son partes del gasto Flex, no importes adicionales.{report?.options.noDispatchCount ? <p>{report.options.noDispatchCount} envíos sin despacho confirmado en el espacio ({report.options.unmatchedCount} sin vínculo con Mercado Libre). Quitá el período para revisarlos.</p> : null}</div> : null}
      {!delivery ? <div className={styles.breakdown}><GroupTable title={filters.zone ? `Partidos · ${filters.zone === '__missing__' ? 'Sin zona' : filters.zone}` : 'Por zona'} groups={filters.zone ? report?.byPartido : report?.byZone} onChoose={(name) => change(filters.zone ? 'partido' : 'zone', name === 'Sin dato' ? '__missing__' : name)} /><GroupTable title="Transportistas Flex" groups={report?.byCarrier} onChoose={(name) => { const carrier = carriers.find((c) => (c.display_name || c.name) === name); change('carrierId', carrier ? String(carrier.id) : '__missing__'); }} /></div> : null}
      <section className={styles.panel}><h2>{delivery ? 'Seguimiento de envíos' : filters.partido ? `Envíos · ${filters.partido === '__missing__' ? 'Sin partido' : filters.partido.replaceAll('_',' ')}` : 'Detalle de envíos'}</h2>{loading ? <div className={styles.empty} role="status">Cargando envíos…</div> : <ShipmentTable rows={shown} delivery={delivery} onSelect={(r) => setSelected(keyOf(r))} />}<div className={styles.footer}><span>{rows.length} envíos · página {page} de {Math.max(1, Math.ceil(rows.length / 50))}</span><div className={styles.actions}><button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><button className="btn btn-ghost btn-sm" disabled={page * 50 >= rows.length} onClick={() => setPage(page + 1)}>Siguiente</button></div></div></section>
      {selectedRow ? <ShipmentDetail row={selectedRow} onClose={() => setSelected(null)} /> : null}
    </> : null}
    {!delivery && tab === 'rates' ? <section className={styles.panel}><h2>Tarifa por envío físico</h2><p className={styles.muted}>Cada tarifa pertenece a este espacio de trabajo. Se utiliza la vigente en la fecha de despacho. Los cambios se agregan con una nueva vigencia.</p>{canEdit ? <RateForm carriers={carriers} busy={busy} onSave={mutate} /> : <p className={styles.muted}>Solo administradores pueden modificar tarifas.</p>}<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Transportista</th><th>Zona</th><th>Vigente desde</th><th className={styles.number}>Por envío</th></tr></thead><tbody>{rates.map((r) => <tr key={r.id}><td>{r.carrier_name}</td><td>{r.zone}</td><td>{when(r.valid_from)}</td><td className={styles.number}>{money(Number(r.amount_cents))}</td></tr>)}</tbody></table>{!rates.length ? <p className={styles.empty}>Cargá las tarifas para comenzar a calcular los gastos Flex.</p> : null}</div></section> : null}
    {!delivery && tab === 'settlements' ? <>
      <section className={styles.panel}><h2>Liquidaciones por transportista</h2><p className={styles.muted}>Período según fecha de entrega confirmada por Mercado Libre. El borrador se vuelve a calcular al cerrar.</p>{canEdit ? <DraftForm carriers={carriers} busy={busy} onSave={mutate} /> : null}<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Número</th><th>Transportista</th><th>Entregas entre</th><th>Estado</th><th className={styles.number}>Importe cerrado + ajustes</th><th /></tr></thead><tbody>{settlements.map((s) => <tr key={s.id}><td>#{s.id}</td><td>{s.carrier_name}</td><td>{when(s.date_from)} — {when(s.date_to)}</td><td><span className={styles.badge}>{statusNames[s.status]}</span></td><td className={styles.number}>{s.status === 'draft' ? 'Ver borrador' : money(Number(s.total_cents) + Number(s.adjustments_cents))}</td><td><button className={styles.link} onClick={() => openSettlement(s.id)}>Revisar</button></td></tr>)}</tbody></table>{!settlements.length ? <p className={styles.empty}>Todavía no hay liquidaciones.</p> : null}</div></section>
      {detail ? <SettlementDetail detail={detail} canEdit={canEdit} busy={busy} onSave={mutate} onClose={() => setDetail(null)} /> : null}
    </> : null}
  </div>;
}

function Metric({ label, value, note }) { return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>; }
function Select({ label, value, onChange, options, all = 'Todos' }) { return <label>{label}<select value={value || ''} onChange={(e) => onChange(e.target.value)}><option value="">{all}</option>{options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select></label>; }
function Filters({ filters, change, carriers, report, delivery }) {
  return <div className={styles.filters}><label>Despacho desde<input type="date" value={filters.from || ''} onChange={(e) => change('from', e.target.value)} /></label><label>Despacho hasta<input type="date" value={filters.to || ''} onChange={(e) => change('to', e.target.value)} /></label>
    <Select label="Cuenta Mercado Libre" value={filters.connectionId} onChange={(v) => change('connectionId', v)} options={(report?.options.connections || []).map((id) => { const seller = report.rows.find((r) => r.connectionId === id)?.sellerId; return [id, seller ? `Vendedor ${seller}` : `Conexión ${id}`]; })} />
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
  return <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Envío / comprador</th><th>Modalidad / transportista</th><th>Zona / partido</th><th>Estado</th>{delivery ? <><th>Entrega estimada</th><th>Entrega real</th><th>Última consulta completa</th></> : <><th>Despacho</th><th className={styles.number}>Ventas brutas</th><th className={styles.number}>Gasto</th></>}<th /></tr></thead><tbody>{rows.map((r) => <tr key={keyOf(r)}><td>{r.shipmentId}<small>{r.recipient}</small></td><td>{r.method === 'flex' ? 'Flex' : 'Colecta'}<small>{r.carrierName || 'Sin transportista propio'}</small></td><td>{r.zone || 'Sin zona'}<small>{r.partido?.replaceAll('_',' ') || 'Sin partido'}</small></td><td><span className={`${styles.badge} ${r.state === 'delivered' ? styles.success : ''}`}>{r.stateLabel}</span>{r.delayed ? <span className={`${styles.badge} ${styles.warning}`}>Demora informada por ML</span> : null}{r.overdue ? <span className={`${styles.badge} ${styles.warning}`}>Plazo vencido</span> : null}{delivery && r.history[0] ? <small>{deliveryEventLabel(r.history[0])} · {when(r.history[0].date)}</small> : null}{r.stale ? <small>Datos desactualizados</small> : null}</td>{delivery ? <><td>{when(r.estimatedDay)}</td><td>{when(r.deliveredAt)}</td><td>{when(r.syncedAt)}</td></> : <><td>{when(r.dispatchDay)}</td><td className={styles.number}>{money(r.salesCents)}<small>{r.paidOrderCount || 0} pedidos pagados{r.salesMissingCount ? ` · ${r.salesMissingCount} sin computar` : ""}</small></td><td className={styles.number}>{money(r.amountCents)}<small>{r.missing || (r.settlementId ? `Liquidación #${r.settlementId}` : '')}</small></td></>}<td>{onSelect ? <button className={styles.link} onClick={() => onSelect(r)}>Detalle</button> : null}</td></tr>)}</tbody></table>{!rows.length ? <p className={styles.empty}>No hay envíos para esta selección.</p> : null}</div>;
}
function ShipmentDetail({ row: r, onClose }) { return <section className={`${styles.panel} ${styles.detail}`} id="shipment-detail" aria-label="Detalle de envío"><div className={styles.actions}><h2>Envío {r.shipmentId}</h2><button className="btn btn-ghost btn-sm" onClick={onClose}>Cerrar detalle</button></div>{r.syncError ? <div className={`${styles.notice} ${styles.error}`}>Última consulta con errores: {r.syncError}. Se conserva el último dato válido.</div> : null}<dl className={styles.facts}>{[['Estado Mercado Libre',r.stateLabel],['Entrega estimada',when(r.estimatedDay)],['Entrega real',when(r.deliveredAt)],['Incidencia',r.incidentReason || 'Sin incidencia informada'],['Última consulta completa',when(r.syncedAt)],['Costo actualizado',when(r.costsSyncedAt)],['Preparación interna',r.internalImportedAt ? `Etiqueta importada: ${when(r.internalImportedAt)}` : 'Sin etiqueta importada'],['Impresión interna',when(r.internalPrintedAt)],['Tarifa aplicada',r.rateId ? `#${r.rateId} · ${money(r.amountCents)}` : r.missing || money(r.amountCents)]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><h2>Historial de Mercado Libre</h2><ol className={styles.timeline}>{r.history.map((e,i) => <li key={`${e.date}:${i}`}>{deliveryEventLabel(e)}<time>{when(e.date)}</time></li>)}</ol>{!r.history.length ? <p className={styles.muted}>Mercado Libre no informó historial.</p> : null}</section>; }
function RateForm({ carriers, busy, onSave }) {
  return <form className={styles.form} onSubmit={async (e) => { e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); const ok = await onSave({ action:'rate', carrierId:Number(f.get('carrier')), zone:f.get('zone'), validFrom:f.get('from'), amountCents:toCents(f.get('amount')) }); if (ok) form.reset(); }}><label>Transportista<select name="carrier" required><option value="">Elegir…</option>{carriers.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}</select></label><label>Zona<select name="zone">{ZONE_ORDER.map((v) => <option key={v}>{v}</option>)}</select></label><label>Vigente desde<input name="from" type="date" required defaultValue={getArgentinaDateString()} /></label><label>Precio por envío · ARS<input name="amount" type="number" min="0" step="0.01" required placeholder="0,00" /></label><button className="btn btn-primary" disabled={busy}>Agregar tarifa</button></form>;
}
function DraftForm({ carriers, busy, onSave }) { return <form className={styles.form} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); onSave({ action:'draft', carrierId:Number(f.get('carrier')), from:f.get('from'), to:f.get('to') }); }}><label>Transportista<select required name="carrier"><option value="">Elegir…</option>{carriers.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}</select></label><label>Entregado desde<input type="date" name="from" required defaultValue={`${getArgentinaDateString().slice(0,7)}-01`} /></label><label>Entregado hasta<input type="date" name="to" required defaultValue={getArgentinaDateString()} /></label><button className="btn btn-primary" disabled={busy}>Crear borrador</button></form>; }
function SettlementDetail({ detail, canEdit, busy, onSave, onClose }) {
  const { settlement:s, items, adjustments, totalCents } = detail;
  return <section className={`${styles.panel} ${styles.detail}`}><div className={styles.actions}><h2>Liquidación #{s.id} · {statusNames[s.status]}</h2><button className="btn btn-ghost btn-sm" onClick={onClose}>Cerrar detalle</button><a className="btn btn-ghost btn-sm" href={`/api${endpoint}?view=settlements&id=${s.id}&format=csv`}>Exportar detalle</a></div><p className={styles.muted}>{items.length} entregados · {when(s.date_from)} al {when(s.date_to)} · Total {money(totalCents)}</p><ShipmentTable rows={items} />
    {adjustments.map((a) => <p className={styles.muted} key={a.id}>Ajuste: {money(Number(a.amount_cents))} · {a.reason} · {when(a.created_at)}</p>)}
    {s.status === 'paid' ? <div className={styles.notice}>Pagada el {when(s.paid_at)}. Referencia: {s.payment_reference || 'Sin referencia'}.</div> : null}
    {canEdit && s.status === 'draft' ? <div className={styles.notice}><p>Revisá los envíos y el importe antes de cerrar. El cierre reserva cada envío y congela su tarifa.</p><button className="btn btn-primary" disabled={busy || !items.length} onClick={() => onSave({ action:'close', id:s.id })}>Cerrar liquidación · {money(totalCents)}</button></div> : null}
    {canEdit && s.status === 'closed' ? <><h2>Registrar pago</h2><form className={styles.form} onSubmit={(e) => { e.preventDefault(); const f=new FormData(e.currentTarget); onSave({ action:'pay', id:s.id, paidAt:f.get('date'), reference:f.get('reference') }); }}><label>Fecha de pago<input required type="date" name="date" defaultValue={getArgentinaDateString()} /></label><label>Referencia opcional<input name="reference" maxLength={500} placeholder="Transferencia, comprobante…" /></label><button disabled={busy} className="btn btn-primary">Marcar pagada · {money(totalCents)}</button></form><h2>Ajuste con motivo</h2><form className={styles.form} onSubmit={(e) => { e.preventDefault(); const f=new FormData(e.currentTarget); onSave({ action:'adjust', id:s.id, amountCents:toCents(f.get('amount')), reason:f.get('reason') }); }}><label>Importe ARS (+ / −)<input required type="number" step="0.01" name="amount" /></label><label>Motivo<input required name="reason" maxLength={1000} /></label><button disabled={busy} className="btn btn-ghost">Agregar ajuste</button></form></> : null}
  </section>;
}
