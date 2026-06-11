"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatArgentinaDate, formatArgentinaDateTime } from "@/lib/dateUtils";
import { toast } from "@/lib/api";
import { openPrintWindow, renderPrintWindow } from "@/lib/printLabel";
import MercadoLibreShipmentMeta from "./MercadoLibreShipmentMeta";

const VIEW_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "printable", label: "Listas para imprimir" },
  { value: "to_dispatch", label: "Para despachar" },
  { value: "no_label", label: "Sin etiqueta lista" },
  { value: "ready", label: "Listos para preparar" },
  { value: "flex", label: "Flex" },
  { value: "colecta", label: "Colecta" },
  { value: "delayed", label: "Demorados" },
  { value: "imported", label: "Importados" },
  { value: "in_transit", label: "En transito" },
  { value: "delivered", label: "Entregados" },
  { value: "scanned", label: "Escaneados" },
  { value: "not_scanned", label: "Sin escanear" },
];

function orderKey(order) {
  return `${order.connectionId || "na"}:${order.id}`;
}

function formatMoney(total, currency) {
  const numeric = Number(total);
  if (Number.isNaN(numeric)) return total ? `${currency || ""} ${total}`.trim() : "-";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: currency || "ARS" }).format(numeric);
}

function logisticLabel(order) {
  if (order.logisticType === "self_service") return "Flex";
  if (order.logisticType === "cross_docking") return "Colecta";
  return order.logisticType || order.shippingMethod || "Envio";
}

function addressLabel(address = {}) {
  return address.address_line || [address.street_name, address.street_number, address.city?.name, address.state?.name].filter(Boolean).join(", ");
}

function summarizeBulkResult(action, data) {
  const parts = [];
  if (data.importedCount) parts.push(`${data.importedCount} importada${data.importedCount === 1 ? "" : "s"}`);
  if (data.queuedCount) parts.push(`${data.queuedCount} encolada${data.queuedCount === 1 ? "" : "s"}`);
  if (!parts.length) parts.push(action === "print" ? "sin etiquetas para imprimir" : "sin etiquetas nuevas");
  const skipped = Array.isArray(data.skipped) ? data.skipped : [];
  if (skipped.length) parts.push(`${skipped.length} omitida${skipped.length === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function Timeline({ events = [] }) {
  if (!events.length) {
    return <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>Sin historial disponible.</div>;
  }

  return (
    <div style={{ display: "grid", gap: "8px", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
      {events.map((event, index) => (
        <div key={`${event.status}-${event.substatus}-${event.date}-${index}`} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "10px", fontSize: "12px" }}>
          <span style={{ color: "var(--text-muted)" }}>{event.date ? formatArgentinaDateTime(event.date) : "-"}</span>
          <span style={{ color: "var(--text-secondary)", fontWeight: 650 }}>{event.label || event.substatus || event.status}</span>
        </div>
      ))}
    </div>
  );
}

function OrderCard({
  order,
  selected,
  compact,
  queued,
  onToggleSelected,
  onImport,
  importing,
  onPrint,
  printing,
  onRefresh,
  refreshing,
  historyOpen,
  onToggleHistory,
}) {
  const products = Array.isArray(order.products) ? order.products : [];
  const totalUnits = products.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  const productNames = products.map((item) => item.name).filter(Boolean).slice(0, 2).join(" · ");
  const isLoading = importing || printing || refreshing;
  const borderColor = STATE_BORDER[order.packageState?.id] || "#cbd5e1";

  if (compact) {
    return (
      <div style={{
        display: "grid",
        gridTemplateColumns: "20px 1fr auto",
        gap: "10px",
        alignItems: "center",
        padding: "10px 14px",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${borderColor}`,
        background: selected ? "var(--accent-soft)" : "var(--surface)",
      }}>
        <input type="checkbox" checked={selected} onChange={onToggleSelected}
          style={{ width: "16px", height: "16px", accentColor: "var(--accent)" }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: "13px" }}>#{order.id}</span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{logisticLabel(order)}</span>
            <span style={{ fontSize: "13px" }}>{order.recipientName || order.buyerNickname || "Sin destinatario"}</span>
            {queued && <span style={{ fontSize: "11px", color: "var(--success)", fontWeight: 700 }}>✓ En cola</span>}
          </div>
          <MercadoLibreShipmentMeta shipment={order} compact />
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {!order.shipmentRowId && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onImport(order)}
              disabled={isLoading || !order.shipmentId || order.printability?.id === "not_ready"} style={{ fontSize: "11px", padding: "4px 8px" }}>
              {importing ? "..." : "Importar"}
            </button>
          )}
          {order.shipmentRowId && (
            <button type="button" className="btn btn-success btn-sm" onClick={() => onPrint(order)}
              disabled={isLoading} style={{ fontSize: "11px", padding: "4px 8px" }}>
              {printing ? "..." : "Imprimir"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-card" style={{ display: "block", padding: "18px", borderLeft: `4px solid ${borderColor}` }}>
      <div className="flex-between" style={{ alignItems: "flex-start", gap: "12px" }}>
        <div style={{ display: "flex", gap: "10px", minWidth: 0 }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            aria-label={`Seleccionar venta ${order.id}`}
            style={{ marginTop: "7px", width: "18px", height: "18px", accentColor: "var(--accent)" }}
          />
          <div style={{ minWidth: 0 }}>
            <div className="mobile-card-title" style={{ fontSize: "20px", marginBottom: "4px" }}>Venta #{order.id}</div>
            <div style={{ fontWeight: 650 }}>{order.recipientName || order.buyerNickname || "Sin destinatario"}</div>
            <div style={{ color: "var(--text-muted)", fontSize: "12px", marginTop: "2px" }}>
              {logisticLabel(order)} · Envio {order.shipmentId || "-"}
            </div>
            <MercadoLibreShipmentMeta shipment={order} />
          </div>
        </div>
        {queued && (
          <span style={{ fontSize: "12px", color: "var(--success)", fontWeight: 700, whiteSpace: "nowrap" }}>✓ En cola</span>
        )}
      </div>

      <div style={{ display: "grid", gap: "8px", marginTop: "14px", color: "var(--text-muted)", fontSize: "13px" }}>
        <div><strong style={{ color: "var(--text)" }}>Total:</strong> {formatMoney(order.total, order.currency)}</div>
        <div><strong style={{ color: "var(--text)" }}>Fecha:</strong> {order.createdAt ? formatArgentinaDate(order.createdAt) : "-"}</div>
        <div><strong style={{ color: "var(--text)" }}>Tracking:</strong> {order.trackingNumber || "-"}</div>
        <div><strong style={{ color: "var(--text)" }}>Direccion:</strong> {addressLabel(order.address) || "-"}</div>
        <div><strong style={{ color: "var(--text)" }}>Productos:</strong> {totalUnits || 0} unid. {productNames ? `· ${productNames}` : ""}</div>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "14px" }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onImport(order)} disabled={isLoading || !order.shipmentId || order.printability?.id === "not_ready"}>
          {importing ? "Importando..." : order.labelImportedAt ? "Reimportar etiqueta" : "Importar ZPL"}
        </button>
        {order.shipmentRowId ? (
          <button type="button" className="btn btn-success btn-sm" onClick={() => onPrint(order)} disabled={isLoading}>
            {printing ? "Encolando..." : "Imprimir"}
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRefresh(order)} disabled={isLoading}>
          {refreshing ? "Actualizando..." : "Actualizar estado"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onToggleHistory}>
          {historyOpen ? "Ocultar historial" : "Ver historial"}
        </button>
        {order.shipmentRowId ? <span style={{ color: "var(--success)", fontSize: "12px", alignSelf: "center" }}>Operacion #{order.shipmentRowId}</span> : null}
      </div>

      {historyOpen ? <Timeline events={order.timeline || []} /> : null}
    </div>
  );
}

const STATE_BORDER = {
  ready_to_print: "#f97316",
  ready_to_ship: "#f97316",
  in_transit: "#22c55e",
  delivered: "#22c55e",
  delayed: "#ef4444",
  canceled: "#94a3b8",
  problem: "#ef4444",
  preparing: "#60a5fa",
  pending: "#cbd5e1",
};

function isToDispatch(order) {
  const hasLabel = Boolean(order.labelImportedAt || order.shipmentRowId);
  const state = order.packageState?.id;
  const gone = ["in_transit", "delivered", "canceled", "problem"].includes(state);
  return hasLabel && !gone;
}

function sortByUrgency(orders) {
  const urgency = (o) => {
    const state = o.packageState?.id;
    const cutoff = o.cutoffDetail?.value;
    if (o.printability?.id === "printable") return 0;
    if (state === "ready_to_ship" || state === "ready_to_print") return cutoff ? 1 : 2;
    if (state === "delayed") return 3;
    if (state === "preparing") return 4;
    if (state === "in_transit") return 5;
    if (state === "delivered") return 6;
    return 7;
  };
  return [...orders].sort((a, b) => {
    const ua = urgency(a), ub = urgency(b);
    if (ua !== ub) return ua - ub;
    const ca = a.cutoffDetail?.value || "", cb = b.cutoffDetail?.value || "";
    if (ca && cb) return ca < cb ? -1 : ca > cb ? 1 : 0;
    return 0;
  });
}

export default function MercadoLibreSection({ currentUser, onBadgeUpdate }) {
  const canManageIntegration = ["owner", "admin"].includes(currentUser?.role);
  const [connected, setConnected] = useState(false);
  const [connections, setConnections] = useState([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [orders, setOrders] = useState([]);
  const [selectedOrderKeys, setSelectedOrderKeys] = useState([]);
  const [openHistoryKeys, setOpenHistoryKeys] = useState([]);
  const [queuedOrderKeys, setQueuedOrderKeys] = useState(new Set());
  const [view, setView] = useState("");
  const [search, setSearch] = useState("");
  const [compact, setCompact] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [bulkAction, setBulkAction] = useState("");
  const [importingId, setImportingId] = useState("");
  const [printingId, setPrintingId] = useState("");
  const [refreshingId, setRefreshingId] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const selectedOrders = useMemo(() => {
    const keys = new Set(selectedOrderKeys);
    return orders.filter((order) => keys.has(orderKey(order)));
  }, [orders, selectedOrderKeys]);

  const sortedOrders = useMemo(() => sortByUrgency(orders), [orders]);
  const printableOrders = useMemo(() => orders.filter((order) => order.printability?.id === "printable"), [orders]);
  const printableFlexCount = useMemo(() => printableOrders.filter((o) => o.logisticType === "self_service").length, [printableOrders]);
  const printableColectaCount = useMemo(() => printableOrders.filter((o) => o.logisticType !== "self_service").length, [printableOrders]);
  const toDispatchOrders = useMemo(() => orders.filter(isToDispatch), [orders]);
  const toDispatchFlexCount = useMemo(() => toDispatchOrders.filter((o) => o.logisticType === "self_service").length, [toDispatchOrders]);
  const toDispatchColectaCount = useMemo(() => toDispatchOrders.filter((o) => o.logisticType !== "self_service").length, [toDispatchOrders]);
  const flexCount = useMemo(() => orders.filter((o) => o.logisticType === "self_service").length, [orders]);
  const colectaCount = useMemo(() => orders.filter((o) => o.logisticType !== "self_service").length, [orders]);
  const selectedVisibleCount = selectedOrders.length;
  const allVisibleSelected = orders.length > 0 && orders.every((order) => selectedOrderKeys.includes(orderKey(order)));
  const allPrintableSelected = printableOrders.length > 0 && printableOrders.every((order) => selectedOrderKeys.includes(orderKey(order)));

  useEffect(() => {
    if (onBadgeUpdate) onBadgeUpdate("mercadolibre", printableOrders.length);
  }, [printableOrders.length, onBadgeUpdate]);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/mercadolibre/status");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo consultar Mercado Libre");
      setConnected(Boolean(data.connected));
      const nextConnections = Array.isArray(data.connections) ? data.connections : [];
      setConnections(nextConnections);
      setSelectedConnectionId((prev) => prev && nextConnections.some((item) => String(item.id) === String(prev)) ? prev : "");
    } catch (err) {
      setError(err.message || "Error inesperado");
    }
  }, []);

  const load = useCallback(async ({ syncMode = "0", q = search } = {}) => {
    setLoading(syncMode !== "force");
    setSyncing(syncMode === "force");
    setError("");
    setWarning("");
    try {
      const params = new URLSearchParams({ sync: syncMode, view });
      if (q) params.set("q", q);
      if (selectedConnectionId) params.set("connection_id", selectedConnectionId);
      const res = await fetch(`/api/admin/mercadolibre?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar Mercado Libre");
      const nextOrders = data.orders || [];
      setOrders(nextOrders);
      const nextKeys = new Set(nextOrders.map(orderKey));
      setSelectedOrderKeys((prev) => prev.filter((key) => nextKeys.has(key)));
      setOpenHistoryKeys((prev) => prev.filter((key) => nextKeys.has(key)));
      if (data.warning) {
        setWarning(data.warning);
      } else if (syncMode === "force") {
        setWarning(data.syncedCount > 0
          ? `Sincronizacion completa: ${data.syncedCount} venta${data.syncedCount === 1 ? "" : "s"} actualizada${data.syncedCount === 1 ? "" : "s"}.`
          : `Sincronizacion completa: no se encontraron ventas pagadas. Total guardado: ${data.totalOrders || 0}.`);
      } else {
        setWarning("");
      }
      setLastSyncedAt(data.lastSyncedAt || "");
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [search, selectedConnectionId, view]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("meli_connected") === "1") {
      setWarning("Integracion con Mercado Libre conectada correctamente.");
      window.history.replaceState({}, "", window.location.pathname + "?tab=mercadolibre");
      loadStatus();
    }
    const meliError = params.get("meli_error");
    if (meliError) {
      setError(decodeURIComponent(meliError));
      window.history.replaceState({}, "", window.location.pathname + "?tab=mercadolibre");
    }
  }, [loadStatus]);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { if (connected) load({ syncMode: "0" }); }, [connected, selectedConnectionId, view, load]);

  const toggleOrderSelection = (order) => {
    const key = orderKey(order);
    setSelectedOrderKeys((prev) => prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]);
  };

  const toggleVisibleSelection = () => {
    const visibleKeys = orders.map(orderKey);
    setSelectedOrderKeys((prev) => {
      if (visibleKeys.every((key) => prev.includes(key))) return prev.filter((key) => !visibleKeys.includes(key));
      return [...new Set([...prev, ...visibleKeys])];
    });
  };

  const togglePrintableSelection = () => {
    const printableKeys = printableOrders.map(orderKey);
    setSelectedOrderKeys((prev) => {
      if (printableKeys.every((key) => prev.includes(key))) return prev.filter((key) => !printableKeys.includes(key));
      return [...new Set([...prev, ...printableKeys])];
    });
  };

  const toggleHistory = (order) => {
    const key = orderKey(order);
    setOpenHistoryKeys((prev) => prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]);
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/mercadolibre/connect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo iniciar Mercado Libre");
      window.location.href = data.authorizeUrl;
    } catch (err) {
      setError(err.message || "Error inesperado");
      setConnecting(false);
    }
  };

  const handleGenerateInvite = async () => {
    setGeneratingInvite(true);
    setError("");
    setInviteUrl("");
    try {
      const res = await fetch("/api/admin/mercadolibre/invite", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo generar el link");
      setInviteUrl(data.inviteUrl);
      await navigator.clipboard.writeText(data.inviteUrl).catch(() => {});
      toast(`Link copiado al portapapeles. Válido por ${data.expiresInHours}hs.`);
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setGeneratingInvite(false);
    }
  };

  const handleDisconnect = async () => {
    if (!selectedConnectionId) return;
    if (!confirm("Seguro que queres desconectar esta cuenta Mercado Libre?")) return;
    try {
      const res = await fetch(`/api/admin/mercadolibre/connect?connection_id=${encodeURIComponent(selectedConnectionId)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo desconectar");
      toast("Cuenta Mercado Libre desconectada", "success");
      await loadStatus();
    } catch (err) {
      setError(err.message || "Error inesperado");
    }
  };

  // Construye la URL de impresión ML-PDF para una lista de órdenes. ML-PDF requiere una sola
  // conexión por pedido; si la selección abarca varias cuentas, imprime la primera y avisa.
  const buildMlPdfUrl = (list) => {
    const byConn = new Map();
    for (const order of list) {
      if (!order.connectionId) continue;
      const key = String(order.connectionId);
      if (!byConn.has(key)) byConn.set(key, []);
      byConn.get(key).push(order.id);
    }
    if (!byConn.size) return null;
    if (byConn.size > 1) {
      toast("La selección tiene varias cuentas; se imprime una por vez", "info");
    }
    const [connectionId, ids] = [...byConn.entries()][0];
    return `/api/labels/ml-pdf?orderIds=${encodeURIComponent(ids.join(","))}&connectionId=${encodeURIComponent(connectionId)}`;
  };

  const runBulk = async (action, sourceOrders) => {
    const list = Array.isArray(sourceOrders) ? sourceOrders : [];
    if (!list.length) {
      toast("No hay ventas seleccionadas", "error");
      return;
    }
    const willPrint = action === "print" || action === "import_and_print";
    if (willPrint && list.length > 5) {
      if (!confirm(`¿Imprimir etiquetas de ${list.length} ventas?`)) return;
    }
    // Abrir la ventana de impresión de forma síncrona (dentro del gesto del clic) para que
    // el bloqueador de popups no la cancele tras los await siguientes.
    const printWin = willPrint ? openPrintWindow() : null;
    if (willPrint && !printWin) return;
    setBulkAction(action);
    try {
      // "print" puro: pedir el PDF directo a Mercado Libre (no requiere importar el ZPL).
      if (action === "print") {
        const url = buildMlPdfUrl(list);
        if (!url) {
          try { printWin.close(); } catch (e) { /* noop */ }
          toast("Las ventas seleccionadas no tienen conexión de Mercado Libre", "error");
          return;
        }
        renderPrintWindow(printWin, url);
        setQueuedOrderKeys((prev) => new Set([...prev, ...list.map(orderKey)]));
        return;
      }

      const bulkApiAction = action === "import_and_print" ? "import" : action;
      const res = await fetch("/api/admin/mercadolibre/bulk-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: bulkApiAction,
          connectionId: selectedConnectionId,
          orderIds: list.map((order) => order.id),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo procesar etiquetas");

      const message = summarizeBulkResult("import", data);
      const nothingImported = !data.importedCount;
      toast(message, nothingImported ? "error" : data.skipped?.length ? "info" : "success");
      if (data.skipped?.length) {
        const sample = data.skipped.slice(0, 4).map((item) => `Venta ${item.orderId}: ${item.reason}`).join(" · ");
        setWarning(`${message}. Detalle: ${sample}`);
      } else if (nothingImported) {
        setWarning(`${message}. No se pudo importar ninguna etiqueta. Verificá que las ventas tengan etiqueta disponible en Mercado Libre.`);
      }

      // import_and_print: ya importamos a la operación; ahora imprimimos pidiendo el PDF
      // directo a Mercado Libre (no depende del ZPL importado).
      if (action === "import_and_print") {
        const url = buildMlPdfUrl(list);
        if (url) {
          renderPrintWindow(printWin, url);
          setQueuedOrderKeys((prev) => new Set([...prev, ...list.map(orderKey)]));
        } else {
          try { printWin.close(); } catch (e) { /* noop */ }
        }
      }

      await load({ syncMode: "0" });
    } catch (err) {
      if (printWin) { try { printWin.close(); } catch (e) { /* noop */ } }
      toast(err.message || "Error al procesar etiquetas", "error");
    } finally {
      setBulkAction("");
    }
  };

  const handleImport = async (order) => {
    if (!order.connectionId) return;
    setImportingId(order.id);
    try {
      const res = await fetch("/api/admin/mercadolibre/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, connectionId: order.connectionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo importar la etiqueta");
      toast("Etiqueta Mercado Libre importada a la operacion", "success");
      await load({ syncMode: "0" });
    } catch (err) {
      toast(err.message || "Error al importar etiqueta", "error");
    } finally {
      setImportingId("");
    }
  };

  const handlePrint = (order) => {
    if (!order.connectionId) return;
    const win = openPrintWindow();
    if (!win) return;
    renderPrintWindow(
      win,
      `/api/labels/ml-pdf?orderId=${encodeURIComponent(order.id)}&connectionId=${encodeURIComponent(order.connectionId)}`,
    );
    setQueuedOrderKeys((prev) => new Set([...prev, orderKey(order)]));
  };

  const handleRefresh = async (order) => {
    if (!order.connectionId) return;
    setRefreshingId(order.id);
    try {
      const res = await fetch("/api/admin/mercadolibre/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, connectionId: order.connectionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo actualizar");
      if (data.order) setOrders((prev) => prev.map((item) => item.id === order.id ? data.order : item));
      toast("Estado actualizado", "success");
    } catch (err) {
      toast(err.message || "Error al actualizar estado", "error");
    } finally {
      setRefreshingId("");
    }
  };

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Mercado Libre</h2>
        <p className="section-subtitle">Ventas pagadas, etiquetas ZPL, corte y seguimiento operativo.</p>
      </div>

      {error ? <div className="card" style={{ marginBottom: "10px", color: "var(--danger)" }}>{error}</div> : null}
      {warning ? <div className="card" style={{ marginBottom: "10px", color: "var(--warning, #c2410c)" }}>{warning}</div> : null}

      <div className="card" style={{ marginBottom: "16px" }}>
        <div className="form-row" style={{ alignItems: "end", flexWrap: "wrap", gap: "10px" }}>
          {canManageIntegration ? <button type="button" className="btn btn-primary" onClick={handleConnect} disabled={connecting}>{connecting ? "Conectando..." : "Conectar cuenta Mercado Libre"}</button> : null}
          {canManageIntegration ? <button type="button" className="btn btn-ghost" onClick={handleGenerateInvite} disabled={generatingInvite}>{generatingInvite ? "Generando..." : "Generar link de invitación"}</button> : null}
          <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>La cuenta debe autorizar con el usuario principal vendedor.</div>
        </div>
        {inviteUrl ? (
          <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <input readOnly value={inviteUrl} style={{ flex: 1, minWidth: "200px", fontSize: "12px", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: "6px", background: "var(--bg-secondary, #f8f9fb)", color: "var(--text-secondary)" }} onClick={(e) => e.target.select()} />
            <button type="button" className="btn btn-ghost" style={{ fontSize: "12px", padding: "6px 12px" }} onClick={() => { navigator.clipboard.writeText(inviteUrl).catch(() => {}); toast("Link copiado"); }}>Copiar</button>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Válido 72hs</span>
          </div>
        ) : null}
      </div>

      {connected ? (
        <>
          {/* Stats rápidas */}
          {orders.length > 0 && (
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
              {printableOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() => setView("printable")}
                  style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "var(--radius)", padding: "10px 16px", display: "flex", flexDirection: "column", gap: "2px", minWidth: "150px", cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ fontSize: "22px", fontWeight: 800, color: "#ea580c", lineHeight: 1 }}>{printableOrders.length}</span>
                  <span style={{ fontSize: "11px", color: "#9a3412", fontWeight: 600 }}>Listas para imprimir</span>
                  <span style={{ fontSize: "11px", color: "#c2410c", marginTop: "2px" }}>
                    {printableColectaCount} colecta · {printableFlexCount} flex
                  </span>
                </button>
              )}
              {toDispatchOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() => setView("to_dispatch")}
                  style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "var(--radius)", padding: "10px 16px", display: "flex", flexDirection: "column", gap: "2px", minWidth: "150px", cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ fontSize: "22px", fontWeight: 800, color: "#059669", lineHeight: 1 }}>{toDispatchOrders.length}</span>
                  <span style={{ fontSize: "11px", color: "#065f46", fontWeight: 600 }}>Para despachar</span>
                  <span style={{ fontSize: "11px", color: "#047857", marginTop: "2px" }}>
                    {toDispatchColectaCount} colecta · {toDispatchFlexCount} flex
                  </span>
                </button>
              )}
              {flexCount > 0 && (
                <div style={{ background: "var(--accent-light)", border: "1px solid var(--accent-soft)", borderRadius: "var(--radius)", padding: "10px 16px", display: "flex", flexDirection: "column", gap: "2px", minWidth: "100px" }}>
                  <span style={{ fontSize: "22px", fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>{flexCount}</span>
                  <span style={{ fontSize: "11px", color: "var(--accent)", fontWeight: 600 }}>Flex</span>
                </div>
              )}
              {colectaCount > 0 && (
                <div style={{ background: "var(--warning-bg)", border: "1px solid #fde68a", borderRadius: "var(--radius)", padding: "10px 16px", display: "flex", flexDirection: "column", gap: "2px", minWidth: "100px" }}>
                  <span style={{ fontSize: "22px", fontWeight: 800, color: "var(--warning)", lineHeight: 1 }}>{colectaCount}</span>
                  <span style={{ fontSize: "11px", color: "var(--warning)", fontWeight: 600 }}>Colecta</span>
                </div>
              )}
            </div>
          )}

          <div className="card" style={{ marginBottom: "16px", padding: "14px" }}>
            <div className="form-row">
              <div className="form-group" style={{ minWidth: "230px" }}>
                <label className="form-label">Cuenta</label>
                <select className="form-input" value={selectedConnectionId} onChange={(e) => setSelectedConnectionId(e.target.value)}>
                  <option value="">Todas las cuentas</option>
                  {connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.displayName || connection.externalStoreId}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ minWidth: "220px" }}>
                <label className="form-label">Vista</label>
                <select className="form-input" value={view} onChange={(e) => setView(e.target.value)}>
                  {VIEW_OPTIONS.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ minWidth: "240px" }}>
                <label className="form-label">Buscar</label>
                <input className="form-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Venta, envio, tracking o cliente" />
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => load({ syncMode: "0" })}>Buscar</button>
              <button type="button" className="btn btn-primary" onClick={() => load({ syncMode: "force" })} disabled={syncing}>{syncing ? "Sincronizando..." : "Sincronizar"}</button>
              {selectedConnectionId ? <button type="button" className="btn btn-ghost" onClick={handleDisconnect}>Desconectar</button> : null}
            </div>
            <div style={{ marginTop: "10px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                {lastSyncedAt ? `Ultima actualizacion ${formatArgentinaDateTime(lastSyncedAt)}` : "Sin ventas sincronizadas todavia"}
                {" · "}
                <span>Impresion por cola: <code>imprimir-cola-v2.bat</code>.</span>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCompact((v) => !v)} style={{ fontSize: "12px" }}>
                {compact ? "Vista detallada" : "Vista compacta"}
              </button>
            </div>
          </div>

          <div className="card" style={{ marginBottom: "16px", padding: "14px", background: "var(--bg-secondary)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {printableOrders.length > 0 && (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", paddingBottom: "10px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#f97316" }}>
                    🖨️ {printableOrders.length} lista{printableOrders.length === 1 ? "" : "s"} para imprimir
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={togglePrintableSelection} disabled={Boolean(bulkAction)}>
                    {allPrintableSelected ? "Deseleccionar" : "Seleccionar"}
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => runBulk("import_and_print", printableOrders)} disabled={Boolean(bulkAction)}>
                    {bulkAction === "import_and_print" ? "Imprimiendo..." : "Imprimir"}
                  </button>
                </div>
              )}
              <div className="flex-between" style={{ gap: "12px", flexWrap: "wrap" }}>
                <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                  {selectedVisibleCount > 0 ? `${selectedVisibleCount} ventas seleccionadas` : `${orders.length} ventas visibles`}
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={toggleVisibleSelection} disabled={!orders.length}>
                    {allVisibleSelected ? "Deseleccionar visibles" : "Seleccionar visibles"}
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => runBulk("import", selectedOrders)} disabled={!selectedVisibleCount || Boolean(bulkAction)}>
                    {bulkAction === "import" ? "Importando..." : "Importar seleccionadas"}
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => runBulk("print", selectedOrders)} disabled={!selectedVisibleCount || Boolean(bulkAction)}>
                    {bulkAction === "print" ? "Encolando..." : "Imprimir seleccionadas"}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => runBulk("import_and_print", orders)} disabled={!orders.length || Boolean(bulkAction)}>
                    {bulkAction === "import_and_print" ? "Procesando..." : "Importar e imprimir visibles"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {loading ? <div className="spinner"></div> : (
            <div style={{ display: "grid", gap: compact ? "4px" : "12px" }}>
              {sortedOrders.map((order) => {
                const key = orderKey(order);
                return (
                  <OrderCard
                    key={key}
                    order={order}
                    compact={compact}
                    queued={queuedOrderKeys.has(key)}
                    selected={selectedOrderKeys.includes(key)}
                    onToggleSelected={() => toggleOrderSelection(order)}
                    onImport={handleImport}
                    importing={importingId === order.id}
                    onPrint={handlePrint}
                    printing={printingId === order.id}
                    onRefresh={handleRefresh}
                    refreshing={refreshingId === order.id}
                    historyOpen={openHistoryKeys.includes(key)}
                    onToggleHistory={() => toggleHistory(order)}
                  />
                );
              })}
              {!orders.length ? <div className="card" style={{ color: "var(--text-muted)" }}>No hay ventas Mercado Libre para mostrar.</div> : null}
            </div>
          )}
        </>
      ) : (
        <div className="card" style={{ color: "var(--text-muted)" }}>Conecta una cuenta Mercado Libre para sincronizar ventas pagadas.</div>
      )}
    </section>
  );
}
