"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatArgentinaDateTime } from "@/lib/dateUtils";
import { getMercadoLibrePackingBreakdown, getMercadoLibrePackingMetrics } from "@/lib/operationMetrics";

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
      const mlPromise = api(`/admin/mercadolibre?sync=${syncSources ? "live" : "0"}`).catch((error) => ({ error: error.message }));
      const sheetPromise = api("/shipments/sheet?status=pending").catch((error) => ({ error: error.message }));
      // La consulta en vivo a Mercado Libre puede tardar; la planilla se muestra apenas llega.
      sheetPromise.then((sheetResult) => setSources((prev) => ({ ...prev, sheet: sheetResult })));
      const [mlResult, sheetResult] = await Promise.all([mlPromise, sheetPromise]);
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

  const mlData = sources.mercadolibre;
  const mlUnavailable = !mlData || mlData.error || mlData.ok === false || !Array.isArray(mlData.liveOrders);
  const mlOrders = mlUnavailable ? [] : mlData.liveOrders;
  const metrics = getMercadoLibrePackingMetrics(mlOrders);
  const breakdown = getMercadoLibrePackingBreakdown(mlOrders);
  const mlPending = mlUnavailable ? (loading || manualUpdating) && !mlData?.error ? "Consultando Mercado Libre…" : "Sin datos de Mercado Libre." : "";

  return <div className="section operation-today">
    <div className="operation-toolbar">
      <div>{manualUpdating ? <small className="operation-last-update" aria-live="polite">Actualizando Mercado Libre y Excel…</small> : lastUpdated ? <small className="operation-last-update">Actualizado {formatArgentinaDateTime(lastUpdated)}</small> : null}</div>
      <div className="operation-toolbar-links">
        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("deliveryControl")}>Control de entregas</button>
        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("logisticsFinance")}>Ventas y costos</button>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading || manualUpdating}>{manualUpdating ? "Actualizando…" : "Actualizar"}</button>
      </div>
    </div>
    {error ? <div className="operation-alert critical"><strong>No pudimos cargar el tablero.</strong><span>{error}</span></div> : null}
    <section className="operation-method-grid" aria-label="Paquetes listos para imprimir">
      <MethodCard title="Logística Flex" tone="flex" total={metrics.flex} pending={mlPending} accounts={breakdown.flex} onOpen={() => onNavigate("flex")} />
      <MethodCard title="Total Colecta" tone="colecta" total={metrics.colecta} pending={mlPending} accounts={breakdown.colecta} onOpen={() => onNavigate("colecta")} />
    </section>
    <SheetLine data={sources.sheet} onOpen={() => onNavigate("sheetSync")} />
  </div>;
}

// Vista mínima: un número por tipo. Doble click (o Enter) abre el detalle por cuenta.
function MethodCard({ title, tone, total, pending, accounts, onOpen }) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((value) => !value);
  return <article
    className={`operation-method-card ${tone} ${open ? "open" : ""}`}
    title="Doble click para ver el detalle"
    onDoubleClick={toggle}
  >
    <p className="operation-method-title">{title}</p>
    {pending ? <div className="operation-source-empty">{pending}</div> : <div className="operation-source-total"><strong>{total}</strong><span>paquetes listos</span></div>}
    <button type="button" className="operation-detail-toggle" aria-expanded={open} onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); toggle(); }}>{open ? "Ocultar detalle" : "Ver detalle"}</button>
    {open ? <div className="operation-method-detail" onDoubleClick={(event) => event.stopPropagation()}>
      <div className="operation-source-rows">
        {accounts.length ? accounts.map((row) => <div key={row.account}><span>{row.account}</span><strong>{row.count}</strong></div>) : <div><span>Sin paquetes listos</span></div>}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={(event) => { event.stopPropagation(); onOpen(); }}>Ir al sector</button>
    </div> : null}
  </article>;
}

function SheetLine({ data, onOpen }) {
  if (!data || data.error || data.ok === false || !Array.isArray(data.shipments)) return null;
  const packed = data.shipments.filter((shipment) => Boolean(shipment.packed)).length;
  const pending = Math.max(0, data.shipments.length - packed);
  return <button type="button" className="operation-sheet-line" onClick={onOpen}>
    Excel: <strong>{pending}</strong> pendientes · <strong>{packed}</strong> empaquetados
  </button>;
}
