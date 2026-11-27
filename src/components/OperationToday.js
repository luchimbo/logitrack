"use client";

import { useCallback, useEffect, useState } from "react";
import GettingStarted from "@/components/GettingStarted";
import { api } from "@/lib/api";
import { formatArgentinaDateTime } from "@/lib/dateUtils";
import { getMercadoLibrePackingBreakdown, getMercadoLibrePackingMetrics } from "@/lib/operationMetrics";

const CACHE_TTL_MS = 60_000;
const DISPLAY_REFRESH_INTERVAL_MS = 60_000;
const operationCaches = new Map();

export default function OperationToday({ currentUser, onNavigate, onReplayTour }) {
  const cacheKey = currentUser?.workspaceId;
  const operationCache = operationCaches.get(cacheKey);
  const [sources, setSources] = useState(() => operationCache?.sources || { mercadolibre: null });
  const [loading, setLoading] = useState(() => !operationCache);
  const [manualUpdating, setManualUpdating] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(() => operationCache?.updatedAt || null);
  const [syncHealth, setSyncHealth] = useState([]);
  const loadSyncHealth = useCallback(() => {
    api("/sync-health").then((result) => setSyncHealth(Array.isArray(result?.connections) ? result.connections : [])).catch(() => {});
  }, []);
  useEffect(() => { loadSyncHealth(); }, [loadSyncHealth, cacheKey]);

  const hydrate = useCallback((snapshot) => {
    setSources(snapshot.sources); setLastUpdated(snapshot.updatedAt);
  }, []);

  const load = useCallback(async (options = {}) => {
    const operationCache = operationCaches.get(cacheKey);
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
      const mlResult = await api(`/admin/mercadolibre?sync=${syncSources ? "live" : "0"}`).catch((error) => ({ error: error.message }));
      const snapshot = {
        sources: {
          mercadolibre: syncSources
            ? mlResult
            : { ...mlResult, liveOrders: operationCache?.sources?.mercadolibre?.liveOrders ?? null },
        },
        updatedAt: new Date(), cachedAt: Date.now(),
      };
      operationCaches.set(cacheKey, snapshot);
      hydrate(snapshot);
    } catch (err) { setError(err.message || "No se pudo cargar la operación de hoy."); }
    finally {
      setLoading(false);
      if (manualRefresh) setManualUpdating(false);
    }
  }, [hydrate, cacheKey]);
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
  // Un fallo de conexión no es lo mismo que no tener canal: el primero se reintenta, el segundo se resuelve en Canales.
  const mlFailed = mlUnavailable && !loading && !manualUpdating && Boolean(mlData?.error);
  const mlPending = mlUnavailable ? (loading || manualUpdating) && !mlData?.error ? "Consultando Mercado Libre…" : mlFailed ? "No pudimos consultar Mercado Libre. Reintentá en unos minutos." : "Todavía no hay paquetes de Mercado Libre para mostrar. Conectá tu cuenta en Canales o subí etiquetas." : "";

  return <div className="section operation-today">
    <GettingStarted onNavigate={onNavigate} onReplayTour={onReplayTour} canManage={currentUser?.isGlobalAdmin || ["owner", "admin"].includes(currentUser?.role)} />
    <header className="operation-toolbar">
      <div>
        <h1 id="operation-packing-title">Paquetes listos para imprimir</h1>
        <p className="operation-last-update" role="status">
          {manualUpdating ? "Actualizando Mercado Libre…" : mlPending || (lastUpdated ? `Mercado Libre · Actualizado ${formatArgentinaDateTime(lastUpdated)}` : "Mercado Libre")}
        </p>
      </div>
      <button type="button" className="btn btn-ghost btn-sm operation-refresh" onClick={load} disabled={loading || manualUpdating}>
        {manualUpdating ? "Actualizando…" : "Actualizar"}
      </button>
    </header>
    {error ? <div className="operation-alert critical" role="alert"><strong>No pudimos cargar el tablero.</strong><span>{error}</span></div> : null}
    <SyncHealthAlerts connections={syncHealth} onConnect={() => onNavigate("integrations")} />
    <section className="operation-method-grid" aria-labelledby="operation-packing-title">
      <MethodCard title="Flex" tone="flex" total={metrics.flex} pending={mlPending} accounts={breakdown.flex} onOpen={() => onNavigate("flex")} onConnect={() => onNavigate("integrations")} onRetry={mlFailed ? load : null} />
      <MethodCard title="Total Colecta" tone="colecta" total={metrics.colecta} pending={mlPending} accounts={breakdown.colecta} onOpen={() => onNavigate("colecta")} onConnect={() => onNavigate("integrations")} onRetry={mlFailed ? load : null} />
    </section>
    <nav className="operation-shortcuts" aria-label="Accesos de Operación de hoy">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate("deliveryControl")}>Control de entregas</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate("logisticsFinance")}>Ventas y costos</button>
    </nav>
  </div>;
}

// Solo se muestran problemas: una cuenta sin corridas todavía (recién conectada) no alarma.
const SYNC_ALERT_LABELS = { needs_reauth: "Reconectar", failing: "Sincronización", stale: "Sincronización", warning: "Aviso" };
export function syncHealthAlerts(connections = []) {
  return connections.filter((item) => SYNC_ALERT_LABELS[item?.status]);
}
function SyncHealthAlerts({ connections, onConnect }) {
  const alerts = syncHealthAlerts(connections);
  if (!alerts.length) return null;
  return <section className="operation-alerts" aria-label="Estado de la sincronización">
    {alerts.map((item) => {
      const critical = item.status === "needs_reauth" || item.status === "failing" || item.status === "stale";
      const lastOk = item.lastOkAt ? ` Última sincronización correcta: ${formatArgentinaDateTime(new Date(item.lastOkAt))}.` : "";
      return <div key={item.connectionId} className={`operation-alert ${critical ? "critical" : "attention"}`} role={critical ? "alert" : "status"}>
        <span>{SYNC_ALERT_LABELS[item.status]}</span>
        <p><strong>{item.displayName}</strong>: {item.message}{lastOk}{item.lastError && item.status !== "needs_reauth" ? ` Detalle: ${item.lastError}` : ""}</p>
        {item.status === "needs_reauth" ? <button type="button" className="btn btn-primary btn-sm" onClick={onConnect}>Ir a Canales</button> : null}
      </div>;
    })}
  </section>;
}

// Vista mínima: un número por tipo. Doble click (o Enter) abre el detalle por cuenta.
function MethodCard({ title, tone, total, pending, accounts, onOpen, onConnect, onRetry }) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((value) => !value);
  return <article
    className={`operation-method-card ${tone} ${open ? "open" : ""}`}
    title="Doble click para ver el detalle"
    onDoubleClick={toggle}
  >
    <p className="operation-method-title">{title}</p>
    {pending ? <div className="operation-source-empty">
      {pending}
      {onRetry ? <button type="button" className="btn btn-primary btn-sm" onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onRetry({ force: true, syncSources: true }); }}>Reintentar</button> : null}
      {!pending.startsWith("Consultando") && !onRetry && onConnect ? <button type="button" className="btn btn-ghost btn-sm" onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onConnect(); }}>Ir a Canales</button> : null}
    </div> :<div className="operation-source-total"><strong>{total}</strong><span>paquetes listos</span></div>}
    <button type="button" className="operation-detail-toggle" aria-expanded={open} onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); toggle(); }}>{open ? "Ocultar detalle" : "Ver detalle"}</button>
    {open ? <div className="operation-method-detail" onDoubleClick={(event) => event.stopPropagation()}>
      <div className="operation-source-rows">
        {accounts.length ? accounts.map((row) => <div key={row.account}><span>{row.account}</span><strong>{row.count}</strong></div>) : <div><span>Sin paquetes listos</span></div>}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={(event) => { event.stopPropagation(); onOpen(); }}>Ir al sector</button>
    </div> : null}
  </article>;
}
