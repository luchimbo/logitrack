"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { EmptyState, Badge, Skeleton } from "@/components/ui";

const STATUS_LABELS = {
  ready_to_pick: "Listo para picking",
  picking: "En picking",
  picked: "Pickeado",
  packing: "En empaque",
  packed: "Empacado",
  ready_to_dispatch: "Listo para despacho",
  dispatched: "Despachado",
  delivered: "Entregado",
  incident: "Con incidencia",
};

const ORDER_LIMIT = 100;

function statusLabel(status) {
  return STATUS_LABELS[status] || status || "Sin estado";
}

export default function OrdersSection() {
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [orderDetail, setOrderDetail] = useState(null);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showIncidentForm, setShowIncidentForm] = useState(false);
  const [incidentType, setIncidentType] = useState("otro");
  const [incidentDescription, setIncidentDescription] = useState("");
  const [error, setError] = useState(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(ORDER_LIMIT) });
      if (status !== "all") params.set("status", status);
      const qs = `?${params.toString()}`;
      const data = await api(`/orders${qs}`);
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  const fetchOrderDetail = useCallback(async (orderId) => {
    if (!orderId) return;
    setDetailLoading(true);
    setError(null);
    try {
      const data = await api(`/orders/${orderId}`);
      setOrderDetail(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    fetchOrders().then(() => {
      if (!active) return;
    });
    return () => {
      active = false;
    };
  }, [fetchOrders]);

  useEffect(() => {
    fetchOrderDetail(selectedOrderId);
  }, [fetchOrderDetail, selectedOrderId]);

  async function runOrderAction(path) {
    if (!selectedOrderId) return;
    setActionLoading(true);
    setError(null);
    try {
      await api(`/orders/${selectedOrderId}/${path}`, { method: "POST" });
      await Promise.all([fetchOrders(), fetchOrderDetail(selectedOrderId)]);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function createIncident() {
    if (!selectedOrderId) return;
    setActionLoading(true);
    setError(null);
    try {
      await api("/incidents", {
        method: "POST",
        body: JSON.stringify({
          order_id: selectedOrderId,
          type: incidentType,
          description: incidentDescription || undefined,
        }),
      });
      setShowIncidentForm(false);
      setIncidentType("otro");
      setIncidentDescription("");
      await Promise.all([fetchOrders(), fetchOrderDetail(selectedOrderId)]);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  const totalUnits = orders.reduce((sum, order) => sum + Number(order.unit_count || 0), 0);
  const readyCount = orders.filter((order) => order.operation_status === "ready_to_pick").length;
  const pickingCount = orders.filter((order) => order.operation_status === "picking").length;
  const incidentCount = orders.filter((order) => order.operation_status === "incident").length;

  return (
    <div className="section active picking-section">
      <div className="picking-hero">
        <div>
          <p className="picking-kicker">Operación diaria</p>
          <h1 className="section-title">Pedidos</h1>
          <p className="section-subtitle">Últimos {ORDER_LIMIT} pedidos canónicos, priorizados para preparación y seguimiento.</p>
        </div>
      </div>

      <div className="picking-metrics" aria-label="Resumen de pedidos">
        <div className="picking-metric picking-metric-primary">
          <span>{orders.length}</span>
          <p>pedidos listados</p>
        </div>
        <div className="picking-metric">
          <span>{totalUnits}</span>
          <p>unidades</p>
        </div>
        <div className="picking-metric picking-metric-colecta">
          <span>{readyCount}</span>
          <p>listos para picking</p>
        </div>
        <div className="picking-metric picking-metric-flex">
          <span>{pickingCount}</span>
          <p>en picking · {incidentCount} incid.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "16px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-muted)" }}>Estado operativo</label>
        <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: "240px" }}>
          <option value="all">Todos</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <Skeleton count={4} />
          <Skeleton count={3} />
        </div>
      )}

      {error && <p style={{ color: "var(--danger)" }}>Error: {error}</p>}

      {!loading && !error && orders.length === 0 && (
        <EmptyState
          icon="📦"
          title="Todavía no hay pedidos"
          description="Subí etiquetas desde la sección Subir Etiquetas para empezar a ver pedidos en esta vista."
          actionLabel="Subir etiquetas"
          onAction={() => {
            const event = new CustomEvent("navigate", { detail: "upload" });
            window.dispatchEvent(event);
          }}
        />
      )}

      {!loading && !error && orders.length > 0 && (
        <div className="picking-layout" style={{ marginBottom: "16px" }}>
          <main className="picking-main" aria-label="Pedidos operativos">
            <section className="picking-group picking-group-flex">
              <div className="picking-group-header">
                <div>
                  <h2>Pedidos recientes</h2>
                  <p>{orders.length} pedidos · límite {ORDER_LIMIT}</p>
                </div>
                <span className="badge">{status === "all" ? "Todos" : statusLabel(status)}</span>
              </div>
              <div className="picking-items">
                {orders.map((order) => (
                  <button
                    key={order.id}
                    className={`picking-item order-picking-card ${selectedOrderId === order.id ? "selected" : ""}`}
                    type="button"
                    onClick={() => setSelectedOrderId(order.id)}
                  >
                    <div className="picking-qty">
                      <span>{Number(order.unit_count || 0)}</span>
                      <small>uds</small>
                    </div>
                    <div className="picking-info">
                      <div className="picking-name">{order.order_number || order.external_order_id || `#${order.id}`}</div>
                      <div className="picking-sku">
                        <span>{order.customer_name || "Cliente sin nombre"}</span>
                        <span>{statusLabel(order.operation_status)}</span>
                        <span>{Number(order.shipment_count || 0)} envío{Number(order.shipment_count || 0) === 1 ? "" : "s"}</span>
                        <span>{order.shipping_method || "Sin método"}</span>
                        <span>{[order.city, order.province].filter(Boolean).join(", ") || "Sin destino"}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </main>
        </div>
      )}

      {selectedOrderId && (
        <div className="card">
          {detailLoading && <div className="spinner"></div>}

          {!detailLoading && orderDetail && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap", marginBottom: "16px" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "18px" }}>Pedido {orderDetail.order.order_number || orderDetail.order.external_order_id || `#${orderDetail.order.id}`}</h2>
                  <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: "13px" }}>{orderDetail.order.customer_name || "Cliente sin nombre"}</p>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button className="btn btn-primary" disabled={actionLoading || orderDetail.order.operation_status === "picking"} onClick={() => runOrderAction("start-picking")}>Iniciar picking</button>
                  <button className="btn" disabled={actionLoading || orderDetail.order.operation_status !== "picking"} onClick={() => runOrderAction("finish-picking")}>Finalizar picking</button>
                  <button className="btn btn-danger" disabled={actionLoading} onClick={() => setShowIncidentForm(v => !v)}>{showIncidentForm ? "Cancelar" : "Crear incidencia"}</button>
                </div>
              </div>

              {showIncidentForm && (
                <div className="card" style={{ marginBottom: "16px", background: "var(--bg-secondary)" }}>
                  <h4 style={{ margin: "0 0 12px", fontSize: "14px" }}>Nueva incidencia</h4>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "12px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-muted)" }}>Tipo</label>
                    <select className="form-select" value={incidentType} onChange={(e) => setIncidentType(e.target.value)} style={{ maxWidth: "240px" }}>
                      <option value="producto_faltante">Producto faltante</option>
                      <option value="stock_insuficiente">Stock insuficiente</option>
                      <option value="producto_danado">Producto dañado</option>
                      <option value="direccion_invalida">Dirección inválida</option>
                      <option value="problema_etiqueta">Problema con etiqueta</option>
                      <option value="reemplazo_producto">Reemplazo de producto</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <textarea
                    className="form-input"
                    placeholder="Descripción del problema..."
                    value={incidentDescription}
                    onChange={(e) => setIncidentDescription(e.target.value)}
                    rows={3}
                    style={{ width: "100%", marginBottom: "12px" }}
                  />
                  <button className="btn btn-primary" disabled={actionLoading} onClick={createIncident}>Guardar incidencia</button>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "16px" }}>
                <div className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
                  <div className="mobile-card-label">Estado</div>
                  <div className="mobile-card-title">{statusLabel(orderDetail.order.operation_status)}</div>
                </div>
                <div className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
                  <div className="mobile-card-label">Metodo</div>
                  <div className="mobile-card-title">{orderDetail.order.shipping_method || "-"}</div>
                </div>
                <div className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
                  <div className="mobile-card-label">Envios</div>
                  <div className="mobile-card-title">{orderDetail.shipments.length}</div>
                </div>
              </div>

              <h3 style={{ fontSize: "15px", marginBottom: "12px" }}>Productos</h3>
              <div className="table-container" style={{ marginBottom: "16px" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>SKU</th>
                      <th>Cantidad</th>
                      <th>Pickeado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderDetail.items.map((item) => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 700 }}>{item.product_name}</td>
                        <td>{item.sku || "-"}</td>
                        <td>{Number(item.quantity || 0)}</td>
                        <td>{item.picked_quantity ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {orderDetail.events.length > 0 && (
                <div>
                  <h3 style={{ fontSize: "15px", marginBottom: "12px" }}>Actividad</h3>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {orderDetail.events.map((event) => (
                      <div key={event.id} style={{ fontSize: "13px", color: "var(--text-muted)", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
                        {event.event_type}: {statusLabel(event.from_status)} a {statusLabel(event.to_status)} · {event.created_at}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
