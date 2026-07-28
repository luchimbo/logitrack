"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatArgentinaDateTime, getArgentinaDateString } from "@/lib/dateUtils";
import { getMercadoLibrePackingMetrics } from "@/lib/operationMetrics";

const todayInArgentina = (value) => value && new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value)) === getArgentinaDateString();
const CACHE_TTL_MS = 60_000;
const DISPLAY_REFRESH_INTERVAL_MS = 15_000;
let operationCache = null;
const statusCopy = {
  ready: { label: "Listo para preparar", note: "El último lote llegó completo y no tiene incidencias.", tone: "success" },
  review: { label: "Revisar", note: "Hay una incidencia que conviene verificar antes de preparar.", tone: "warning" },
  missing: { label: "Sin sincronizar", note: "Todavía no hay un lote confirmado hoy. Ejecutá el .bat y actualizá esta vista.", tone: "danger" },
};

export default function OperationToday({ onNavigate }) {
  const [jobs, setJobs] = useState(() => operationCache?.jobs || []);
  const [health, setHealth] = useState(() => operationCache?.health || null);
  const [detail, setDetail] = useState(() => operationCache?.detail || null);
  const [sources, setSources] = useState(() => operationCache?.sources || { mercadolibre: null, tiendanube: null, sheet: null });
  const [loading, setLoading] = useState(() => !operationCache);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(() => operationCache?.updatedAt || null);

  const hydrate = useCallback((snapshot) => {
    setJobs(snapshot.jobs); setHealth(snapshot.health); setDetail(snapshot.detail);
    setSources(snapshot.sources); setLastUpdated(snapshot.updatedAt);
  }, []);

  const load = useCallback(async (options = {}) => {
    const force = options?.force === true || Boolean(options?.currentTarget);
    const syncSources = options?.syncSources === true || Boolean(options?.currentTarget);
    const cacheIsFresh = operationCache && Date.now() - operationCache.cachedAt < CACHE_TTL_MS;
    if (!force && cacheIsFresh) {
      hydrate(operationCache);
      setLoading(false);
      return operationCache;
    }
    if (!operationCache) setLoading(true);
    setError("");
    try {
      const [jobsData, healthData, mlResult, tnResult, sheetResult] = await Promise.all([
        api("/v2/print-jobs?limit=20"), api("/flex-health?period=today"),
        api(`/admin/mercadolibre?sync=${syncSources ? "force" : "0"}`).catch((error) => ({ error: error.message })),
        api(`/admin/tiendanube?sync=${syncSources ? "force" : "0"}`).catch((error) => ({ error: error.message })),
        api("/shipments/sheet?status=pending").catch((error) => ({ error: error.message })),
      ]);
      const todayJobs = (jobsData.jobs || []).filter((job) => todayInArgentina(job.received_at));
      const detail = todayJobs[0] ? await api(`/v2/print-jobs/${encodeURIComponent(todayJobs[0].job_id)}`) : null;
      const snapshot = {
        jobs: todayJobs, health: healthData, detail,
        sources: { mercadolibre: mlResult, tiendanube: tnResult, sheet: sheetResult },
        updatedAt: new Date(), cachedAt: Date.now(),
      };
      operationCache = snapshot;
      hydrate(snapshot);
    } catch (err) { setError(err.message || "No se pudo cargar la operación de hoy."); }
    finally { setLoading(false); }
  }, [hydrate]);
  // Los webhooks guardan los cambios de ML/Tiendanube apenas ocurren. El tablero
  // relee ese estado local con frecuencia: es mucho más rápido que recorrer todas
  // las ventas contra las APIs externas en cada actualización.
  useEffect(() => { load({ force: true }); }, [load]);
  useEffect(() => {
    const refreshIntervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") load({ force: true }).catch(() => {});
    }, DISPLAY_REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(refreshIntervalId);
    };
  }, [load]);

  const job = jobs[0];
  const alerts = useMemo(() => {
    const next = [];
    if (!job) next.push({ severity: "critical", text: "No hay un lote sincronizado hoy.", action: "Actualizar" });
    else {
      if (!job.integrity?.verified || job.integrity.input_blocks !== job.integrity.output_blocks) next.push({ severity: "critical", text: "La integridad del último lote no pudo verificarse.", action: "Ver detalle", target: "printJobs" });
      if (job.reprints_total > 0) next.push({ severity: "attention", text: `${job.reprints_total} etiqueta${job.reprints_total === 1 ? "" : "s"} fue${job.reprints_total === 1 ? "" : "ron"} reimpresa${job.reprints_total === 1 ? "" : "s"}.`, action: "Revisar incidencias", target: "printJobs" });
      if ((job.integrity?.parser_misses || 0) > 0) next.push({ severity: "attention", text: `${job.integrity.parser_misses} etiqueta(s) no se pudieron interpretar por completo.`, action: "Ver detalle", target: "printJobs" });
    }
    if (health?.totals?.assignable_unassigned > 0) next.push({ severity: "attention", text: `${health.totals.assignable_unassigned} envío(s) Flex están sin transportista.`, action: "Resolver Flex", target: "flex" });
    if (health?.totals?.without_partido > 0 || health?.totals?.unknown_zone_group > 0) next.push({ severity: "attention", text: "Hay destinos Flex que requieren revisión de zona.", action: "Configurar zonas", target: "zoneConfig" });
    return next;
  }, [health, job]);
  const status = !job ? "missing" : alerts.length ? "review" : "ready";
  const preparation = useMemo(() => {
    const groups = new Map();
    for (const item of detail?.items || []) {
      if (item.is_reprint) continue;
      const key = item.sku || item.product_name || "Sin SKU";
      const current = groups.get(key) || { key, product: item.product_name || "Producto sin nombre", total: 0, flex: 0, colecta: 0 };
      current.total += 1; if (item.shipping_method === "flex") current.flex += 1; if (item.shipping_method === "colecta") current.colecta += 1;
      groups.set(key, current);
    }
    return [...groups.values()].sort((a, b) => b.total - a.total || a.product.localeCompare(b.product));
  }, [detail]);
  const copy = statusCopy[status];

  return <div className="section operation-today">
    <div className="operation-header"><div><p className="operation-kicker">Paquetes que entran automáticamente</p><h1 className="section-title">Operación de hoy</h1><p className="section-subtitle">Mercado Libre, Tiendanube y planilla se actualizan sin cargar etiquetas.</p>{lastUpdated ? <small className="operation-last-update">Actualizado {formatArgentinaDateTime(lastUpdated)}</small> : null}</div><button className="btn btn-ghost" onClick={load} disabled={loading}>{loading ? "Actualizando…" : "Actualizar"}</button></div>
    {error ? <div className="operation-alert critical"><strong>No pudimos cargar el tablero.</strong><span>{error}</span></div> : null}
    <section className="operation-sources" aria-label="Paquetes por origen"><div className="operation-section-heading"><div><p className="operation-kicker">Paquetes a preparar</p><h2>Divididos por sector</h2><p>La operación de cada canal queda separada para evitar mezclar paquetes.</p></div></div><div className="operation-source-grid"><SourceCard title="Mercado Libre" subtitle="Envíos listos para empaquetar" tone="ml" data={sources.mercadolibre} onOpen={() => onNavigate("mercadolibre")} renderMetrics={(data) => <MercadoLibreMetrics orders={data.orders} />} /><SourceCard title="Tiendanube" subtitle="Pedidos sincronizados desde Tiendanube" tone="tn" data={sources.tiendanube} onOpen={() => onNavigate("tiendanube")} renderMetrics={(data) => <TiendanubeMetrics orders={data.orders} />} /><SourceCard title="Envíos a coordinar" subtitle="Pendientes recibidos desde la planilla" tone="sheet" data={sources.sheet} onOpen={() => onNavigate("sheetSync")} renderMetrics={(data) => <SheetMetrics shipments={data.shipments} />} /></div></section>
    <section className={`operation-hero ${copy.tone}`} aria-live="polite"><div><p className="operation-eyebrow">Estado del último lote impreso</p><h2>{copy.label}</h2><p>{copy.note}</p></div><div className="operation-status-mark" aria-hidden="true">{status === "ready" ? "✓" : status === "review" ? "!" : "—"}</div></section>
    {job ? <><section className="operation-metrics" aria-label="Resumen del último lote"><Metric value={job.labels_total} label="etiquetas" /><Metric value={job.skus_total} label="SKUs" /><Metric value={job.reprints_total} label="reimpresiones" /><Metric value={job.integrity?.verified ? "OK" : "—"} label="integridad" /></section><section className="operation-lot card"><div><p className="operation-eyebrow">Último lote sincronizado</p><h3>{formatArgentinaDateTime(job.received_at)}</h3><p>Impresora: {job.printer_path || "No informada"}</p></div><div className="operation-actions"><button className="btn btn-primary" onClick={() => onNavigate("printJobs")}>Ver detalle</button><button className="btn btn-ghost" onClick={() => document.getElementById("preparacion")?.scrollIntoView({ behavior: "smooth" })}>Ver resumen de preparación</button></div></section></> : null}
    {alerts.length ? <section className="operation-alerts"><h2>Revisar antes de preparar</h2>{alerts.map((alert, index) => <div key={`${alert.text}-${index}`} className={`operation-alert ${alert.severity}`}><span>{alert.severity === "critical" ? "Crítico" : "Atención"}</span><p>{alert.text}</p><button className="btn btn-ghost btn-sm" onClick={() => alert.target ? onNavigate(alert.target) : load}>{alert.action}</button></div>)}</section> : null}
    {job ? <section id="preparacion" className="operation-preparation"><div className="operation-section-heading"><div><p className="operation-kicker">Chequeo opcional</p><h2>Resumen de preparación</h2><p>Unidades esperadas, sin contar reimpresiones.</p></div><span className="topbar-chip accent">{preparation.reduce((total, item) => total + item.total, 0)} unidades</span></div>{preparation.length ? <div className="operation-sku-list">{preparation.map((item) => <div key={item.key} className="operation-sku"><strong>{item.total}</strong><div><h3>{item.product}</h3><p>SKU: {item.key} · Flex {item.flex} · Colecta {item.colecta}</p></div></div>)}</div> : <div className="empty-state"><p className="empty-state-text">No hay etiquetas operativas para preparar en este lote.</p></div>}</section> : null}
    {jobs.length > 1 ? <section className="operation-history"><h2>Trabajos de hoy</h2><div>{jobs.slice(1, 5).map((historic) => <button key={historic.job_id} className="operation-history-item" onClick={() => onNavigate("printJobs")}><span>{formatArgentinaDateTime(historic.received_at)}</span><strong>{historic.labels_total} etiquetas</strong><small>{historic.reprints_total ? `${historic.reprints_total} reimpresiones` : "Sin reimpresiones"}</small></button>)}</div></section> : null}
  </div>;
}
function Metric({ value, label }) { return <div className="operation-metric"><strong>{value}</strong><span>{label}</span></div>; }

function SourceCard({ title, subtitle, tone, data, onOpen, renderMetrics }) {
  const unavailable = !data || data.error || data.ok === false;
  return <article className={`operation-source-card ${tone}`}><div className="operation-source-head"><div><p>{title}</p><span>{subtitle}</span></div><button className="btn btn-ghost btn-sm" onClick={onOpen}>Ver sector</button></div>{unavailable ? <div className="operation-source-empty">{title === "Envíos a coordinar" ? "La planilla no está disponible para este espacio." : "Sin datos sincronizados o integración no conectada."}</div> : renderMetrics(data)}</article>;
}
function MercadoLibreMetrics({ orders = [] }) {
  const metrics = getMercadoLibrePackingMetrics(orders);
  return <SourceMetrics total={metrics.total} rows={[{ label: "Flex", value: metrics.flex }, { label: "Colecta", value: metrics.colecta }]} />;
}
function TiendanubeMetrics({ orders = [] }) {
  const actionable = orders.filter((order) => !["cancelled", "closed", "delivered"].includes(String(order.shippingStatus || "").toLowerCase()));
  const toSend = actionable.filter((order) => ["", "unshipped", "ready_to_ship", "packed", "unpacked", "partially_packed", "partially_fulfilled"].includes(String(order.shippingStatus || "").toLowerCase())).length;
  return <SourceMetrics total={actionable.length} rows={[{ label: "Para preparar", value: toSend }, { label: "Otros activos", value: Math.max(0, actionable.length - toSend) }]} />;
}
function SheetMetrics({ shipments = [] }) { const packed = shipments.filter((shipment) => Boolean(shipment.packed)).length; return <SourceMetrics total={shipments.length} rows={[{ label: "Empaquetados", value: packed }, { label: "Pendientes", value: Math.max(0, shipments.length - packed) }]} />; }
function SourceMetrics({ total, rows }) { return <><div className="operation-source-total"><strong>{total}</strong><span>paquetes</span></div><div className="operation-source-rows">{rows.map((row) => <div key={row.label}><span>{row.label}</span><strong>{row.value}</strong></div>)}</div></>; }
