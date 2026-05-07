"use client";

import { useState } from "react";
import { useIsMobile } from "@/hooks/useMediaQuery";
import {
  DEV_GEOMODI_TIENDANUBE_META,
  DEV_GEOMODI_TIENDANUBE_ORDERS,
  DEV_GEOMODI_USER,
  DEV_GEOMODI_ZIPNOVA_META,
  DEV_GEOMODI_ZIPNOVA_SHIPMENTS,
} from "@/lib/devGeomodiMock";

function formatCurrency(total, currency = "ARS") {
  const numeric = Number(total);

  if (Number.isNaN(numeric)) {
    return `${currency} ${total}`.trim();
  }

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(numeric);
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTiendanubeOperationalStatus(order) {
  if (String(order?.dispatchStatus || "").toLowerCase() === "dispatched") {
    return { key: "dispatched", label: "Despachado", color: "#22c55e" };
  }

  return { key: "to_send", label: "Por enviar", color: "#f97316" };
}

function getTiendanubeShippingLabel(order) {
  const carrier = String(order?.shippingCarrier || "").trim();
  const method = String(order?.shippingMethod || "").trim();

  if (carrier && method) {
    return carrier.toLowerCase() === method.toLowerCase() ? carrier : `${carrier} · ${method}`;
  }

  return carrier || method || "Envío a domicilio";
}

function getTiendanubeProductSummary(order) {
  const products = Array.isArray(order?.products) ? order.products : [];
  const totalUnits = products.reduce((sum, product) => sum + (Number(product?.quantity || 0) || 1), 0);

  if (!products.length) {
    return { label: "Sin productos", detail: "-" };
  }

  if (products.length === 1) {
    return { label: `${totalUnits} unid.`, detail: products[0]?.name || "Producto" };
  }

  return { label: `${totalUnits} unid.`, detail: `${products.length} productos` };
}

function tiendanubeBadgeStyle(color) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 8px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 700,
    border: `1px solid ${color}33`,
    color,
    background: `${color}12`,
    lineHeight: 1,
  };
}

function matchesTiendanubeSearch(order, query) {
  if (!query) {
    return true;
  }

  const normalized = query.trim().toLowerCase();
  const haystack = [
    order.number,
    order.contactName,
    order.contactEmail,
    order.shippingAddress?.city,
    order.shippingAddress?.province,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

function TiendanubeOrderDetails({ order }) {
  const shippingAddress = [
    order.shippingAddress?.address,
    order.shippingAddress?.number,
    order.shippingAddress?.city,
    order.shippingAddress?.province,
  ].filter(Boolean).join(", ");

  return (
    <div style={{ display: "grid", gap: "10px" }}>
      {order.dispatchMarkedAt ? (
        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>Marcado:</strong> {formatDateTime(order.dispatchMarkedAt)}
          {order.dispatchMarkedBy ? ` · ${order.dispatchMarkedBy}` : ""}
        </div>
      ) : null}
      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
        <strong style={{ color: "var(--text)" }}>Envío:</strong> {shippingAddress || "Sin dirección"}
        {order.shippingAddress?.zipcode ? ` · CP ${order.shippingAddress.zipcode}` : ""}
      </div>
      <div style={{ display: "grid", gap: "6px" }}>
        {(order.products || []).map((product, index) => (
          <div key={`${order.id}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "12px" }}>
            <span style={{ color: "var(--text)" }}>{product.name || "Producto"}</span>
            <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>x{product.quantity || 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TiendanubeOrderCard({ order, expanded, selected, onToggleExpand, onToggleSelect }) {
  const operational = getTiendanubeOperationalStatus(order);
  const productSummary = getTiendanubeProductSummary(order);

  return (
    <div className="mobile-card" style={{ display: "block", marginBottom: 0, padding: "18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0, display: "flex", gap: "12px", alignItems: "flex-start", flex: 1 }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Seleccionar pedido ${order.number || order.id}`}
            style={{ marginTop: "4px" }}
          />
          <div style={{ minWidth: 0 }}>
            <div className="mobile-card-title" style={{ fontSize: "20px", marginBottom: "4px" }}>
              Pedido #{order.number || order.id}
            </div>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text)" }}>{order.contactName || "Sin nombre"}</div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>{getTiendanubeShippingLabel(order)}</div>
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onToggleExpand}>
          {expanded ? "Ocultar" : "Detalle"}
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "12px" }}>
        <span style={tiendanubeBadgeStyle(operational.color)}>{operational.label}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px", marginTop: "14px" }}>
        <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>Total:</strong> {formatCurrency(order.total, order.currency)}
        </div>
        <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>Fecha:</strong> {formatDate(order.createdAt)}
        </div>
        <div style={{ fontSize: "13px", color: "var(--text-muted)", gridColumn: "1 / -1" }}>
          <strong style={{ color: "var(--text)" }}>Productos:</strong> {productSummary.label} · {productSummary.detail}
        </div>
      </div>

      {expanded ? (
        <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--border)" }}>
          <TiendanubeOrderDetails order={order} />
        </div>
      ) : null}
    </div>
  );
}

function isZipnovaLabelAvailable(shipment) {
  const status = String(shipment?.status || "").toLowerCase();
  return status === "documentation_ready" || status === "ready_to_ship";
}

function groupZipnovaProducts(shipments) {
  const grouped = new Map();

  shipments.forEach((shipment) => {
    const products = Array.isArray(shipment.products) ? shipment.products : [];

    products.forEach((product) => {
      const key = `${product.sku || ""}::${product.name || "Sin producto"}`;
      const current = grouped.get(key) || {
        key,
        name: product.name || "Sin producto",
        sku: product.sku || "-",
        shipmentCount: 0,
        packages: 0,
      };

      current.shipmentCount += 1;
      current.packages += Number(shipment.total_packages || 0) || 1;
      grouped.set(key, current);
    });
  });

  return [...grouped.values()].sort((a, b) => b.packages - a.packages || a.name.localeCompare(b.name));
}

function matchesZipnovaSearch(shipment, query) {
  if (!query) {
    return true;
  }

  const normalized = query.trim().toLowerCase();
  const productNames = (shipment.products || []).map((product) => product.name).join(" ").toLowerCase();
  const haystack = [shipment.external_id, shipment.status_name, shipment.status, productNames].filter(Boolean).join(" ").toLowerCase();

  return haystack.includes(normalized);
}

function ZipnovaShipmentCard({ shipment, onDownload }) {
  const available = isZipnovaLabelAvailable(shipment);

  return (
    <div className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
      <div className="mobile-card-title">Envío {shipment.external_id || shipment.id}</div>
      <div className="mobile-card-body" style={{ marginTop: "8px" }}>
        <div className="mobile-card-row">
          <span className="mobile-card-label">Estado Zipnova</span>
          <span className="mobile-card-value">{shipment.status_name || shipment.status || "-"}</span>
        </div>
        <div className="mobile-card-row">
          <span className="mobile-card-label">Etiqueta</span>
          <span className="mobile-card-value" style={{ color: available ? "var(--success)" : "var(--warning)" }}>
            {available ? "Disponible" : "No disponible todavía"}
          </span>
        </div>
        <div className="mobile-card-row">
          <span className="mobile-card-label">Paquetes</span>
          <span className="mobile-card-value">{shipment.total_packages || 0}</span>
        </div>
        <div className="mobile-card-row">
          <span className="mobile-card-label">Productos</span>
          <span className="mobile-card-value">{shipment.products?.map((product) => product.name).filter(Boolean).join(", ") || "-"}</span>
        </div>
        {shipment.downloaded_at ? (
          <div className="mobile-card-row">
            <span className="mobile-card-label">Marcado listo</span>
            <span className="mobile-card-value">{formatDateTime(shipment.downloaded_at)}</span>
          </div>
        ) : null}
        {shipment.downloaded_by ? (
          <div className="mobile-card-row">
            <span className="mobile-card-label">Por</span>
            <span className="mobile-card-value">{shipment.downloaded_by}</span>
          </div>
        ) : null}
        <div className="mobile-card-row" style={{ marginTop: "8px" }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => onDownload(shipment)}
            disabled={!available}
            title={available ? "Descargar etiqueta mock" : "Etiqueta aún no disponible"}
          >
            Descargar etiqueta
          </button>
        </div>
      </div>
    </div>
  );
}

function ZipnovaSummaryBlock({ title, shipments, emptyLabel, onDownloadGroup, onDownloadShipment }) {
  const groupedProducts = groupZipnovaProducts(shipments);
  const totalPackages = shipments.reduce((sum, shipment) => sum + (Number(shipment.total_packages || 0) || 1), 0);
  const availableCount = shipments.filter(isZipnovaLabelAvailable).length;

  return (
    <div className="card">
      <div className="flex-between mb-md">
        <div>
          <h3 style={{ fontSize: "16px", fontWeight: 700 }}>{title}</h3>
          <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>{shipments.length} envíos</span>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={onDownloadGroup} disabled={!shipments.length}>
          Etiquetas PDF
        </button>
      </div>

      <div className="stats-grid" style={{ marginBottom: "16px" }}>
        <div className="stat-card card accent"><div className="stat-value">{shipments.length}</div><div className="stat-label">Envíos</div></div>
        <div className="stat-card card info"><div className="stat-value">{totalPackages}</div><div className="stat-label">Paquetes</div></div>
        <div className="stat-card card success"><div className="stat-value">{groupedProducts.length}</div><div className="stat-label">Productos</div></div>
      </div>

      {shipments.length > 0 ? (
        <div style={{ marginBottom: "12px", color: "var(--text-muted)", fontSize: "13px" }}>
          {availableCount} de {shipments.length} envíos con etiqueta disponible en Zipnova
        </div>
      ) : null}

      <div style={{ display: "grid", gap: "10px" }}>
        {groupedProducts.map((product) => (
          <div key={product.key} className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
            <div className="mobile-card-title">{product.name}</div>
            <div className="mobile-card-body" style={{ marginTop: "8px" }}>
              <div className="mobile-card-row"><span className="mobile-card-label">SKU / Ref</span><span className="mobile-card-value">{product.sku}</span></div>
              <div className="mobile-card-row"><span className="mobile-card-label">Envíos</span><span className="mobile-card-value">{product.shipmentCount}</span></div>
              <div className="mobile-card-row"><span className="mobile-card-label">Paquetes</span><span className="mobile-card-value">{product.packages}</span></div>
            </div>
          </div>
        ))}
        {groupedProducts.length === 0 ? <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>{emptyLabel}</p> : null}
      </div>

      {shipments.length > 0 ? (
        <div style={{ display: "grid", gap: "10px", marginTop: "16px" }}>
          {shipments.map((shipment) => (
            <ZipnovaShipmentCard
              key={shipment.id}
              shipment={shipment}
              onDownload={() => onDownloadShipment(shipment)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MockTiendanubeSection() {
  const [connected, setConnected] = useState(true);
  const [orders, setOrders] = useState(DEV_GEOMODI_TIENDANUBE_ORDERS);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("to_send");
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(DEV_GEOMODI_TIENDANUBE_META.lastSyncedAt);

  const connectedAt = DEV_GEOMODI_TIENDANUBE_META.connectedAt;
  const visibleOrders = orders.filter((order) => matchesTiendanubeSearch(order, search)).filter((order) => {
    const key = getTiendanubeOperationalStatus(order).key;

    if (viewMode === "all") {
      return true;
    }

    return key === viewMode;
  });
  const orderedOrders = [...visibleOrders].sort((a, b) => {
    const orderA = getTiendanubeOperationalStatus(a).key === "to_send" ? 0 : 1;
    const orderB = getTiendanubeOperationalStatus(b).key === "to_send" ? 0 : 1;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });
  const toDispatchCount = orders.filter((order) => getTiendanubeOperationalStatus(order).key === "to_send").length;
  const dispatchedCount = orders.filter((order) => getTiendanubeOperationalStatus(order).key === "dispatched").length;
  const allVisibleSelected = orderedOrders.length > 0 && orderedOrders.every((order) => selectedOrderIds.includes(order.id));
  const selectedVisibleCount = orderedOrders.filter((order) => selectedOrderIds.includes(order.id)).length;

  const handleSearchSubmit = () => {
    setSearch(draftSearch);
  };

  const toggleOrderSelection = (id) => {
    setSelectedOrderIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedOrderIds((current) => current.filter((id) => !orderedOrders.some((order) => order.id === id)));
      return;
    }

    setSelectedOrderIds((current) => [...new Set([...current, ...orderedOrders.map((order) => order.id)])]);
  };

  const updateDispatchStatus = (status) => {
    if (!selectedOrderIds.length) {
      return;
    }

    const markTime = new Date().toISOString();

    setOrders((current) => current.map((order) => {
      if (!selectedOrderIds.includes(order.id)) {
        return order;
      }

      return {
        ...order,
        dispatchStatus: status,
        dispatchMarkedAt: status === "dispatched" ? markTime : "",
        dispatchMarkedBy: status === "dispatched" ? DEV_GEOMODI_USER.email : "",
      };
    }));
    setSelectedOrderIds([]);
    setLastSyncedAt(markTime);
  };

  if (!connected) {
    return (
      <section className="section active">
        <div className="section-header">
          <h1 className="section-title">🛒 Tiendanube Mock</h1>
          <p className="section-subtitle">Vista mock del panel de pedidos operativos.</p>
        </div>
        <div className="card" style={{ maxWidth: "560px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>Conectar con Tiendanube</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "16px" }}>
            Este estado también es mock. Te sirve para revisar la tarjeta de conexión sin depender del OAuth real.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setConnected(true)}>
            Simular conexión
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="section active">
      <div className="section-header">
        <h1 className="section-title">🛒 Dashboard de envíos Tiendanube</h1>
        <p className="section-subtitle">Pedidos mock que necesitan atención operativa inmediata.</p>
      </div>

      <div className="card" style={{ marginBottom: "12px" }}>
        <div className="flex-between" style={{ flexWrap: "wrap", gap: "8px" }}>
          <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>
            Integración activa · Conectado el {formatDateTime(connectedAt)} · Última sync {formatDateTime(lastSyncedAt)}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConnected(false)}>
            Simular desconexión
          </button>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: "16px" }}>
        <div className="stat-card card warning"><div className="stat-value">{toDispatchCount}</div><div className="stat-label">Por enviar</div></div>
        <div className="stat-card card success"><div className="stat-value">{dispatchedCount}</div><div className="stat-label">Despachados</div></div>
        <div className="stat-card card"><div className="stat-value" style={{ color: "var(--text-secondary)" }}>{orders.length}</div><div className="stat-label">Total activos</div></div>
      </div>

      <div className="card" style={{ marginBottom: "18px", padding: "14px" }}>
        <div className="form-row">
          <div className="form-group" style={{ minWidth: "280px" }}>
            <label className="form-label">Buscar</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                className="form-input"
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSearchSubmit();
                  }
                }}
                placeholder="Número de pedido o cliente"
              />
              <button type="button" className="btn btn-ghost" onClick={handleSearchSubmit}>
                Buscar
              </button>
            </div>
          </div>
          <div className="form-group" style={{ minWidth: "320px" }}>
            <label className="form-label">Vista</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {["all", "to_send", "dispatched"].map((mode) => {
                const styleByMode = {
                  all: { background: viewMode === "all" ? "var(--surface-hover)" : "transparent", color: "var(--text)" },
                  to_send: { background: viewMode === "to_send" ? "rgba(249,115,22,0.12)" : "transparent", color: viewMode === "to_send" ? "#f97316" : "var(--text)" },
                  dispatched: { background: viewMode === "dispatched" ? "rgba(34,197,94,0.12)" : "transparent", color: viewMode === "dispatched" ? "#22c55e" : "var(--text)" },
                };

                const labels = {
                  all: "Todo",
                  to_send: "Por enviar",
                  dispatched: "Despachados",
                };

                return (
                  <button
                    key={mode}
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setViewMode(mode)}
                    style={{
                      ...styleByMode[mode],
                      border: "1px solid var(--border)",
                    }}
                  >
                    {labels[mode]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="form-group" style={{ maxWidth: "180px" }}>
            <button type="button" className="btn btn-ghost" onClick={() => setLastSyncedAt(new Date().toISOString())}>
              Sincronizar
            </button>
          </div>
        </div>
      </div>

      {orderedOrders.length > 0 ? (
        <div className="card" style={{ marginBottom: "18px", padding: "14px 16px", background: "var(--bg-secondary)" }}>
          <div className="flex-between" style={{ gap: "12px", flexWrap: "wrap" }}>
            <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
              {selectedOrderIds.length > 0
                ? `${selectedOrderIds.length} pedidos seleccionados${selectedVisibleCount > 0 ? ` · ${selectedVisibleCount} visibles en esta vista` : ""}`
                : "Seleccioná pedidos para marcarlos en batch"}
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={toggleSelectAllVisible}>
                {allVisibleSelected ? "Deseleccionar visibles" : "Seleccionar visibles"}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={!selectedOrderIds.length}
                onClick={() => updateDispatchStatus("dispatched")}
                style={{ background: "var(--success-bg)", color: "var(--success)", border: "1px solid var(--success)" }}
              >
                Marcar despachados
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={!selectedOrderIds.length}
                onClick={() => updateDispatchStatus("to_send")}
                style={{ background: "rgba(249,115,22,0.12)", color: "#f97316", border: "1px solid #f97316" }}
              >
                Marcar por enviar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {orderedOrders.length > 0 ? (
        <>
          <div className="table-container desktop-only">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "42px" }}>
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} aria-label="Seleccionar visibles" />
                  </th>
                  <th>Pedido</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>Productos</th>
                  <th>Envío</th>
                  <th>Estado</th>
                  <th style={{ width: "100px" }}>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {orderedOrders.map((order) => {
                  const operational = getTiendanubeOperationalStatus(order);
                  const productSummary = getTiendanubeProductSummary(order);
                  const expanded = expandedId === order.id;

                  return [
                    <tr key={order.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedOrderIds.includes(order.id)}
                          onChange={() => toggleOrderSelection(order.id)}
                          aria-label={`Seleccionar pedido ${order.number || order.id}`}
                        />
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: "var(--text)" }}>#{order.number || order.id}</div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{order.contactEmail || "-"}</div>
                      </td>
                      <td>{formatDate(order.createdAt)}</td>
                      <td>
                        <div style={{ color: "var(--text)", fontWeight: 600 }}>{order.contactName || "Sin nombre"}</div>
                      </td>
                      <td>
                        <div style={{ color: "var(--text)", fontWeight: 700 }}>{formatCurrency(order.total, order.currency)}</div>
                      </td>
                      <td>
                        <div style={{ color: "var(--accent)", fontWeight: 600 }}>{productSummary.label}</div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{productSummary.detail}</div>
                      </td>
                      <td>
                        <div style={{ color: "var(--text)", fontWeight: 600 }}>{getTiendanubeShippingLabel(order)}</div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          {order.shippingAddress?.city || order.shippingAddress?.province || "Sin dirección"}
                        </div>
                      </td>
                      <td>
                        <span style={tiendanubeBadgeStyle(operational.color)}>{operational.label}</span>
                      </td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExpandedId(expanded ? null : order.id)}>
                          {expanded ? "Ocultar" : "Detalle"}
                        </button>
                      </td>
                    </tr>,
                    expanded ? (
                      <tr key={`${order.id}-detail`}>
                        <td colSpan={9} style={{ background: "var(--bg-secondary)", padding: "16px 20px" }}>
                          <TiendanubeOrderDetails order={order} />
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>

          <div className="mobile-only" style={{ display: "grid", gap: "16px" }}>
            {orderedOrders.map((order) => (
              <TiendanubeOrderCard
                key={order.id}
                order={order}
                expanded={expandedId === order.id}
                selected={selectedOrderIds.includes(order.id)}
                onToggleExpand={() => setExpandedId(expandedId === order.id ? null : order.id)}
                onToggleSelect={() => toggleOrderSelection(order.id)}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="card">
          <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
            {viewMode === "to_send"
              ? "No hay pedidos por enviar en este momento."
              : viewMode === "dispatched"
                ? "No hay pedidos despachados para mostrar."
                : "No hay pedidos visibles para el filtro aplicado."}
          </p>
        </div>
      )}
    </section>
  );
}

export function MockZipnovaSection() {
  const isMobile = useIsMobile();
  const [connected, setConnected] = useState(true);
  const [shipments, setShipments] = useState(DEV_GEOMODI_ZIPNOVA_SHIPMENTS);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState(DEV_GEOMODI_ZIPNOVA_META.lastSyncedAt);
  const [downloadMessage, setDownloadMessage] = useState("");

  const connectedAt = DEV_GEOMODI_ZIPNOVA_META.connectedAt;
  const filteredShipments = shipments.filter((shipment) => matchesZipnovaSearch(shipment, search));
  const pendingShipments = filteredShipments.filter((shipment) => !isZipnovaLabelAvailable(shipment));
  const readyShipments = filteredShipments.filter((shipment) => isZipnovaLabelAvailable(shipment));

  const handleSearchSubmit = () => {
    setSearch(draftSearch);
  };

  const downloadLabels = (group, items) => {
    const availableIds = items.filter(isZipnovaLabelAvailable).map((item) => item.id);
    const markTime = new Date().toISOString();

    setShipments((current) => current.map((shipment) => (
      availableIds.includes(shipment.id)
        ? { ...shipment, downloaded_at: markTime, downloaded_by: DEV_GEOMODI_USER.email }
        : shipment
    )));
    setLastSyncedAt(markTime);
    setDownloadMessage(
      availableIds.length > 0
        ? `Mock PDF generado para ${group}: ${availableIds.length} etiquetas listas.`
        : `Mock PDF generado para ${group}: todavía no hay etiquetas disponibles.`
    );
  };

  if (!connected) {
    return (
      <section className="section active">
        <div className="section-header">
          <h1 className="section-title">📮 Zipnova Mock</h1>
          <p className="section-subtitle">Vista mock de la integración y descarga de etiquetas.</p>
        </div>
        <div className="card" style={{ maxWidth: "560px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>Conectar con Zipnova</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "16px" }}>
            Este estado local te permite revisar el bloque de conexión sin depender del OAuth ni de las credenciales reales.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setConnected(true)}>
            Simular conexión
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="section active">
      <div className="section-header">
        <h1 className="section-title">📮 Zipnova</h1>
        <p className="section-subtitle">Integración mock con grupos pendientes y listos para despacho.</p>
      </div>

      <div className="card" style={{ marginBottom: "12px" }}>
        <div className="flex-between" style={{ flexWrap: "wrap", gap: "8px" }}>
          <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>
            Integración activa · Conectado el {formatDateTime(connectedAt)} · Última sync {formatDateTime(lastSyncedAt)}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConnected(false)}>
            Simular desconexión
          </button>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: "18px" }}>
        <div className="stat-card card accent"><div className="stat-value">{filteredShipments.length}</div><div className="stat-label">Zipnova hoy</div></div>
        <div className="stat-card card info"><div className="stat-value">{pendingShipments.length}</div><div className="stat-label">Pendientes</div></div>
        <div className="stat-card card success"><div className="stat-value">{readyShipments.length}</div><div className="stat-label">Listos</div></div>
      </div>

      <div className="card" style={{ marginBottom: "18px" }}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Buscar por External ID o producto</label>
            <input
              className="form-input"
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSearchSubmit();
                }
              }}
              placeholder="Buscar envío Zipnova de hoy"
            />
          </div>
          <div className="form-group" style={{ maxWidth: "180px" }}>
            <button type="button" className="btn btn-primary" onClick={handleSearchSubmit}>
              Buscar
            </button>
          </div>
          <div className="form-group" style={{ maxWidth: "220px" }}>
            <button type="button" className="btn btn-ghost" onClick={() => setLastSyncedAt(new Date().toISOString())}>
              Sincronizar ahora
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(360px, 1fr))", gap: "20px" }}>
        <ZipnovaSummaryBlock
          title="Pendientes"
          shipments={pendingShipments}
          emptyLabel="No hay envíos nuevos pendientes."
          onDownloadGroup={() => downloadLabels("pendientes", pendingShipments)}
          onDownloadShipment={(shipment) => downloadLabels(`envio-${shipment.external_id || shipment.id}`, [shipment])}
        />
        <ZipnovaSummaryBlock
          title="Listos para despachar"
          shipments={readyShipments}
          emptyLabel="No hay envíos listos para despacho."
          onDownloadGroup={() => downloadLabels("listos-para-despachar", readyShipments)}
          onDownloadShipment={(shipment) => downloadLabels(`envio-${shipment.external_id || shipment.id}`, [shipment])}
        />
      </div>

      {downloadMessage ? (
        <div className="card" style={{ marginTop: "18px" }}>
          {downloadMessage}
        </div>
      ) : null}
    </section>
  );
}
