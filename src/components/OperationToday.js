"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatArgentinaDateTime } from "@/lib/dateUtils";
import { getMercadoLibrePackingMetrics } from "@/lib/operationMetrics";

const CACHE_TTL_MS = 60_000;
const DISPLAY_REFRESH_INTERVAL_MS = 15_000;
let operationCache = null;

export default function OperationToday({ onNavigate }) {
  const [sources, setSources] = useState(() => operationCache?.sources || { mercadolibre: null, sheet: null });
  const [loading, setLoading] = useState(() => !operationCache);
  const [manualUpdating, setManualUpdating] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(() => operationCache?.updatedAt || null);

  const hydrate = useCallback((snapshot) => {
    setSources(snapshot.sources); setLastUpdated(snapshot.updatedAt);
  }, []);

  const load = useCallback(async (options = {}) => {
    const manualRefresh = Boolean(options?.currentTarget);
    const force = options?.force === true || manualRefresh;
    const syncSources = options?.syncSources === true || manualRefresh;
    const cacheIsFresh = operationCache && Date.now() - operationCache.cachedAt < CACHE_TTL_MS;
    if (!force && cacheIsFresh) {
      hydrate(operationCache);
      setLoading(false);
      return operationCache;
    }
    if (!operationCache) setLoading(true);
    if (manualRefresh) setManualUpdating(true);
    setError("");
    try {
      const [mlResult, sheetResult] = await Promise.all([
        api(`/admin/mercadolibre?sync=${syncSources ? "live" : "0"}`).catch((error) => ({ error: error.message })),
        api("/shipments/sheet?status=pending").catch((error) => ({ error: error.message })),
      ]);
      const snapshot = {
        sources: {
          mercadolibre: syncSources
            ? mlResult
            : { ...mlResult, liveOrders: operationCache?.sources?.mercadolibre?.liveOrders ?? null },
          sheet: sheetResult,
        },
        updatedAt: new Date(), cachedAt: Date.now(),
      };
      operationCache = snapshot;
      hydrate(snapshot);
    } catch (err) { setError(err.message || "No se pudo cargar la operación de hoy."); }
    finally {
      setLoading(false);
      if (manualRefresh) setManualUpdating(false);
    }
  }, [hydrate]);
  // Los webhooks guardan los cambios de ML/Tiendanube apenas ocurren. El tablero
  // relee ese estado local con frecuencia: es mucho más rápido que recorrer todas
  // las ventas contra las APIs externas en cada actualización.
  useEffect(() => { load({ force: true, syncSources: true }); }, [load]);
  useEffect(() => {
    const refreshIntervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") load({ force: true }).catch(() => {});
    }, DISPLAY_REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(refreshIntervalId);
    };
  }, [load]);

  return <div className="section operation-today">
    <div className="operation-header"><div><p className="operation-kicker">Etiquetas a preparar</p><h1 className="section-title">Operación de hoy</h1><p className="section-subtitle">Mercado Libre y el Excel de etiquetas se actualizan automáticamente.</p>{manualUpdating ? <small className="operation-last-update" aria-live="polite">Actualizando Mercado Libre y Excel…</small> : lastUpdated ? <small className="operation-last-update">Actualizado {formatArgentinaDateTime(lastUpdated)}</small> : null}</div><button className="btn btn-ghost" onClick={load} disabled={loading || manualUpdating}>{manualUpdating ? "Actualizando…" : "Actualizar"}</button></div>
    {error ? <div className="operation-alert critical"><strong>No pudimos cargar el tablero.</strong><span>{error}</span></div> : null}
    <section className="operation-sources" aria-label="Etiquetas por origen"><div className="operation-section-heading"><div><p className="operation-kicker">Paquetes a preparar</p><h2>Por origen</h2><p>Las etiquetas de Mercado Libre y del Excel se mantienen separadas para preparar sin mezclas.</p></div></div><div className="operation-source-grid"><SourceCard title="Mercado Libre" subtitle="Etiquetas listas para imprimir" tone="ml" data={sources.mercadolibre} requireLiveData onOpen={() => onNavigate("mercadolibre")} renderMetrics={(data) => <MercadoLibreMetrics orders={data.liveOrders} />} /><SourceCard title="Etiquetas a preparar" subtitle="Pendientes recibidos desde Excel" tone="sheet" data={sources.sheet} onOpen={() => onNavigate("sheetSync")} renderMetrics={(data) => <SheetMetrics shipments={data.shipments} />} /></div></section>
  </div>;
}

function SourceCard({ title, subtitle, tone, data, requireLiveData = false, onOpen, renderMetrics }) {
  const unavailable = !data || data.error || data.ok === false || (requireLiveData && !Array.isArray(data.liveOrders));
  return <article className={`operation-source-card ${tone}`}><div className="operation-source-head"><div><p>{title}</p><span>{subtitle}</span></div><button className="btn btn-ghost btn-sm" onClick={onOpen}>Ver sector</button></div>{unavailable ? <div className="operation-source-empty">{title === "Envíos a coordinar" ? "La planilla no está disponible para este espacio." : "Sin datos sincronizados o integración no conectada."}</div> : renderMetrics(data)}</article>;
}
function MercadoLibreMetrics({ orders = [] }) {
  const metrics = getMercadoLibrePackingMetrics(orders);
  return <SourceMetrics total={metrics.total} rows={[{ label: "Flex", value: metrics.flex }, { label: "Colecta", value: metrics.colecta }]} />;
}
function SheetMetrics({ shipments = [] }) { const packed = shipments.filter((shipment) => Boolean(shipment.packed)).length; return <SourceMetrics total={shipments.length} rows={[{ label: "Empaquetados", value: packed }, { label: "Pendientes", value: Math.max(0, shipments.length - packed) }]} />; }
function SourceMetrics({ total, rows }) { return <><div className="operation-source-total"><strong>{total}</strong><span>paquetes</span></div><div className="operation-source-rows">{rows.map((row) => <div key={row.label}><span>{row.label}</span><strong>{row.value}</strong></div>)}</div></>; }
