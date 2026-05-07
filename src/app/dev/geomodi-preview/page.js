"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MockTiendanubeSection, MockZipnovaSection } from "@/components/DevGeomodiIntegrationsMock";
import GeoModiLogo from "@/components/GeoModiLogo";
import { useIsMobile } from "@/hooks/useMediaQuery";
import {
  DEV_GEOMODI_CARRIERS,
  DEV_GEOMODI_NAV_GROUPS,
  DEV_GEOMODI_SHIPMENTS,
  DEV_GEOMODI_USER,
} from "@/lib/devGeomodiMock";

const MapWithNoSSR = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
  loading: () => <div className="spinner"></div>,
});

function countBy(items, getKey) {
  const counts = {};

  items.forEach((item) => {
    const key = getKey(item);
    counts[key] = (counts[key] || 0) + 1;
  });

  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function getStatusStyle(status) {
  switch (status) {
    case "entregado":
      return { background: "var(--success-bg)", color: "var(--success)" };
    case "en ruta":
    case "en hub":
      return { background: "var(--info-bg)", color: "var(--info)" };
    case "despachado":
      return { background: "var(--accent-light)", color: "var(--accent)" };
    case "pendiente":
      return { background: "var(--warning-bg)", color: "var(--warning)" };
    default:
      return { background: "rgba(148, 163, 184, 0.12)", color: "var(--text-secondary)" };
  }
}

function getCarrierMeta(name) {
  return DEV_GEOMODI_CARRIERS.find((carrier) => carrier.name === name);
}

function renderShipmentRows(shipments) {
  return shipments.map((shipment) => {
    const statusStyle = getStatusStyle(shipment.status);
    const carrier = getCarrierMeta(shipment.assigned_carrier);

    return (
      <tr key={shipment.id}>
        <td style={{ fontWeight: 700, color: "var(--text)" }}>{shipment.product_name}</td>
        <td>{shipment.recipient_name}</td>
        <td>{shipment.city}, {shipment.province}</td>
        <td>
          <span className={`badge ${shipment.shipping_method === "flex" ? "badge-flex" : "badge-colecta"}`}>
            {shipment.shipping_method}
          </span>
        </td>
        <td>
          <span className="badge" style={statusStyle}>{shipment.status}</span>
        </td>
        <td>
          {carrier ? (
            <span className="badge" style={{ background: `${carrier.color}22`, color: carrier.color }}>
              {carrier.display_name}
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>Sin asignar</span>
          )}
        </td>
      </tr>
    );
  });
}

function DevGeomodiPreviewContent() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mapView, setMapView] = useState("flex");
  const [lastRefreshAt, setLastRefreshAt] = useState(() => new Date());

  const allowedTabs = DEV_GEOMODI_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id));
  const activeTabFromUrl = searchParams.get("tab");
  const activeTab = allowedTabs.includes(activeTabFromUrl) ? activeTabFromUrl : "dashboard";

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    };

    if (sidebarOpen) {
      document.body.classList.add("sidebar-open");
      window.addEventListener("keydown", handleEscape);
    } else {
      document.body.classList.remove("sidebar-open");
    }

    return () => {
      document.body.classList.remove("sidebar-open");
      window.removeEventListener("keydown", handleEscape);
    };
  }, [sidebarOpen]);

  const handleNavClick = (tabId) => {
    setSidebarOpen(false);

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tabId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const allShipments = DEV_GEOMODI_SHIPMENTS;
  const flexShipments = allShipments.filter((shipment) => shipment.shipping_method === "flex");
  const colectaShipments = allShipments.filter((shipment) => shipment.shipping_method === "colecta");
  const visibleMapShipments = mapView === "flex" ? flexShipments : colectaShipments;
  const assignedFlex = flexShipments.filter((shipment) => shipment.assigned_carrier);
  const unassignedFlex = flexShipments.filter((shipment) => !shipment.assigned_carrier);
  const deliveredCount = allShipments.filter((shipment) => shipment.status === "entregado").length;
  const inTransitCount = allShipments.filter((shipment) => ["despachado", "en ruta", "en hub"].includes(shipment.status)).length;
  const methodCounts = countBy(allShipments, (shipment) => shipment.shipping_method);
  const provinceCounts = countBy(allShipments, (shipment) => shipment.province).slice(0, 6);
  const carrierCounts = countBy(assignedFlex, (shipment) => getCarrierMeta(shipment.assigned_carrier)?.display_name || shipment.assigned_carrier);
  const zoneCounts = countBy(flexShipments, (shipment) => shipment.zone || "Sin zona");
  const sectionTitle = DEV_GEOMODI_NAV_GROUPS.flatMap((group) => group.items).find((item) => item.id === activeTab)?.label || "GeoModi Preview";
  const mapEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
  const lastRefreshLabel = new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(lastRefreshAt);

  const renderDashboard = () => (
    <div className="section active">
      <div className="section-header">
        <h1 className="section-title">📊 Dashboard Mock</h1>
        <p className="section-subtitle">Replica local con datos fijos para revisar layout, estados y densidad visual.</p>
      </div>

      <div className="card" style={{ marginBottom: "20px", display: "grid", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--accent)", marginBottom: "6px" }}>
              Modo desarrollo
            </div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)", marginBottom: "4px" }}>
              Sin login, sin DB y con envios de ejemplo permanentes
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>
              Esta vista te deja probar cambios de UI en la shell de GeoModi sin depender de cargas reales.
            </div>
          </div>
          <span className="topbar-chip accent">Ult. refresh mock {lastRefreshLabel}</span>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card card accent"><div className="stat-value">{allShipments.length}</div><div className="stat-label">Envios</div></div>
        <div className="stat-card card info"><div className="stat-value">{allShipments.reduce((total, shipment) => total + shipment.units, 0)}</div><div className="stat-label">Unidades</div></div>
        <div className="stat-card card success"><div className="stat-value">{deliveredCount}</div><div className="stat-label">Entregados</div></div>
        <div className="stat-card card warning"><div className="stat-value">{inTransitCount}</div><div className="stat-label">En circuito</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "20px", marginBottom: "20px" }}>
        <div className="card">
          <h3 style={{ marginBottom: "16px", fontSize: "15px", fontWeight: 700 }}>📦 Mix por metodo</h3>
          <div className="chart-bar-container">
            {methodCounts.map(([method, count]) => (
              <div key={method} className="chart-bar-row">
                <div className="chart-bar-label">{method}</div>
                <div className="chart-bar-track">
                  <div className={`chart-bar-fill ${method === "flex" ? "accent" : "info"}`} style={{ width: `${Math.max(24, Math.round((count / allShipments.length) * 100))}%` }}>
                    {count}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: "16px", fontSize: "15px", fontWeight: 700 }}>📍 Top provincias</h3>
          <div className="chart-bar-container">
            {provinceCounts.map(([province, count]) => (
              <div key={province} className="chart-bar-row">
                <div className="chart-bar-label">{province}</div>
                <div className="chart-bar-track">
                  <div className="chart-bar-fill warning" style={{ width: `${Math.max(24, Math.round((count / provinceCounts[0][1]) * 100))}%` }}>
                    {count}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex-between" style={{ gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 700 }}>🧾 Envio de referencia</h3>
          <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>Siempre visible para testear tablas y badges</span>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Destinatario</th>
                <th>Destino</th>
                <th>Metodo</th>
                <th>Estado</th>
                <th>Carrier</th>
              </tr>
            </thead>
            <tbody>{renderShipmentRows(allShipments)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderFlex = () => (
    <div className="section active">
      <div className="section-header flex-between" style={{ gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h1 className="section-title">🚀 Flex Mock</h1>
          <p className="section-subtitle">Vista estable con zonas, carriers y un caso sin asignar para probar estados críticos.</p>
        </div>
        <span className="topbar-chip" style={{ background: unassignedFlex.length ? "var(--danger-bg)" : "var(--success-bg)", color: unassignedFlex.length ? "var(--danger)" : "var(--success)" }}>
          {unassignedFlex.length ? `${unassignedFlex.length} sin asignar` : "Todo asignado"}
        </span>
      </div>

      <div className="card" style={{ marginBottom: "20px", borderLeft: `3px solid ${unassignedFlex.length ? "var(--danger)" : "var(--success)"}` }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", marginBottom: "6px" }}>
          Semaforo Flex: {unassignedFlex.length ? "🔴 Atencion" : "🟢 OK"}
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>
          El mock conserva un envio pendiente de carrier para que puedas validar estados visuales, chips y alertas.
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card card accent"><div className="stat-value">{flexShipments.length}</div><div className="stat-label">Total Flex</div></div>
        <div className="stat-card card success"><div className="stat-value">{assignedFlex.length}</div><div className="stat-label">Asignados</div></div>
        <div className="stat-card card danger"><div className="stat-value">{unassignedFlex.length}</div><div className="stat-label">Sin carrier</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "20px", marginBottom: "20px" }}>
        <div className="card">
          <h3 style={{ marginBottom: "16px", fontSize: "15px", fontWeight: 700 }}>🗺️ Zonas activas</h3>
          <div className="chart-bar-container">
            {zoneCounts.map(([zone, count]) => (
              <div key={zone} className="chart-bar-row">
                <div className="chart-bar-label">{zone}</div>
                <div className="chart-bar-track">
                  <div className="chart-bar-fill accent" style={{ width: `${Math.max(24, Math.round((count / zoneCounts[0][1]) * 100))}%` }}>
                    {count}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: "16px", fontSize: "15px", fontWeight: 700 }}>🚛 Carga por transportista</h3>
          <div className="chart-bar-container">
            {carrierCounts.map(([carrier, count]) => (
              <div key={carrier} className="chart-bar-row">
                <div className="chart-bar-label">{carrier}</div>
                <div className="chart-bar-track">
                  <div className="chart-bar-fill success" style={{ width: `${Math.max(24, Math.round((count / carrierCounts[0][1]) * 100))}%` }}>
                    {count}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Tracking</th>
                <th>Producto</th>
                <th>Zona</th>
                <th>Partido</th>
                <th>Carrier</th>
                <th>ETA</th>
              </tr>
            </thead>
            <tbody>
              {flexShipments.map((shipment) => {
                const carrier = getCarrierMeta(shipment.assigned_carrier);

                return (
                  <tr key={shipment.id}>
                    <td style={{ fontFamily: "ui-monospace, monospace", color: "var(--accent)", fontWeight: 700 }}>{shipment.tracking_number}</td>
                    <td style={{ fontWeight: 700, color: "var(--text)" }}>{shipment.product_name}</td>
                    <td>{shipment.zone}</td>
                    <td>{shipment.city}</td>
                    <td>
                      {carrier ? (
                        <span className="badge" style={{ background: `${carrier.color}22`, color: carrier.color }}>
                          {carrier.display_name}
                        </span>
                      ) : (
                        <span className="badge" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>Pendiente</span>
                      )}
                    </td>
                    <td>{shipment.eta}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderColecta = () => (
    <div className="section active">
      <div className="section-header">
        <h1 className="section-title">📦 Colecta Mock</h1>
        <p className="section-subtitle">Ejemplos de interior para revisar tablas, badges y volumen visual.</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card card accent"><div className="stat-value">{colectaShipments.length}</div><div className="stat-label">Total Colecta</div></div>
        <div className="stat-card card info"><div className="stat-value">{colectaShipments.filter((shipment) => shipment.status === "en ruta" || shipment.status === "en hub").length}</div><div className="stat-label">En red</div></div>
        <div className="stat-card card warning"><div className="stat-value">{colectaShipments.filter((shipment) => shipment.status === "pendiente").length}</div><div className="stat-label">Pendientes</div></div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Tracking</th>
                <th>Producto</th>
                <th>Destinatario</th>
                <th>Ciudad</th>
                <th>Estado</th>
                <th>ETA</th>
              </tr>
            </thead>
            <tbody>
              {colectaShipments.map((shipment) => (
                <tr key={shipment.id}>
                  <td style={{ fontFamily: "ui-monospace, monospace", color: "var(--info)", fontWeight: 700 }}>{shipment.tracking_number}</td>
                  <td style={{ fontWeight: 700, color: "var(--text)" }}>{shipment.product_name}</td>
                  <td>{shipment.recipient_name}</td>
                  <td>{shipment.city}, {shipment.province}</td>
                  <td><span className="badge" style={getStatusStyle(shipment.status)}>{shipment.status}</span></td>
                  <td>{shipment.eta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderMap = () => (
    <div className="section active">
      <div className="section-header flex-between" style={{ gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h1 className="section-title">📍 Mapa Mock</h1>
          <p className="section-subtitle">Usa el componente real del mapa con los carriers y envios de ejemplo.</p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className={`btn btn-sm ${mapView === "flex" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMapView("flex")}>
            🚀 Flex
          </button>
          <button type="button" className={`btn btn-sm ${mapView === "colecta" ? "btn-primary" : "btn-ghost"}`} onClick={() => setMapView("colecta")}>
            📦 Colecta
          </button>
        </div>
      </div>

      {!mapEnabled ? (
        <div className="card" style={{ marginBottom: "20px", borderLeft: "3px solid var(--warning)" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", marginBottom: "6px" }}>
            Falta `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>
            La ruta sigue sirviendo para maquetar el layout, pero si queres ver el mapa real necesitás esa variable en `.env.local`.
          </div>
        </div>
      ) : null}

      <div className="card" style={{ padding: "12px", marginBottom: "20px" }}>
        <div style={{ height: isMobile ? "420px" : "640px", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface)" }}>
          <MapWithNoSSR view={mapView} shipments={visibleMapShipments} carriers={DEV_GEOMODI_CARRIERS} />
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: "16px", fontSize: "15px", fontWeight: 700 }}>📌 Puntos visibles</h3>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
          {visibleMapShipments.map((shipment) => (
            <div key={shipment.id} style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "14px", background: "var(--bg-secondary)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700, color: "var(--text)" }}>{shipment.product_name}</div>
                <span className={`badge ${shipment.shipping_method === "flex" ? "badge-flex" : "badge-colecta"}`}>{shipment.shipping_method}</span>
              </div>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{shipment.address}</div>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{shipment.city}, {shipment.province}</div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px" }}>lat {shipment.lat} · lng {shipment.lng}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderSection = () => {
    switch (activeTab) {
      case "flex":
        return renderFlex();
      case "colecta":
        return renderColecta();
      case "map":
        return renderMap();
      case "tiendanube":
        return <MockTiendanubeSection />;
      case "zipnova":
        return <MockZipnovaSection />;
      default:
        return renderDashboard();
    }
  };

  return (
    <>
      <div className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />

      <nav className={`sidebar ${sidebarOpen ? "open" : ""}`} onClick={(event) => event.stopPropagation()}>
        <div className="sidebar-header">
          <GeoModiLogo size="sm" />
          <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menu">
            ✕
          </button>
        </div>

        <div className="nav-links">
          {DEV_GEOMODI_NAV_GROUPS.map((group) => (
            <div key={group.title} className="nav-group">
              <div className="nav-group-title">{group.title}</div>
              <ul className="nav-group-list">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <a
                      href="#"
                      className={`nav-link ${activeTab === item.id ? "active" : ""}`}
                      onClick={(event) => {
                        event.preventDefault();
                        handleNavClick(item.id);
                      }}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ padding: "16px", borderTop: "1px solid var(--border)" }}>
          <div className="user-profile" style={{ justifyContent: "flex-start", marginBottom: "16px" }}>
            <div className="avatar">G</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>{DEV_GEOMODI_USER.email}</div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{DEV_GEOMODI_USER.workspaceName} · {DEV_GEOMODI_USER.role}</div>
            </div>
          </div>
          <div className="card" style={{ padding: "14px", background: "var(--surface-hover)" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--accent)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: ".08em" }}>
              Sandbox local
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Todo lo que ves en esta ruta es mock. No toca auth, DB ni endpoints reales.
            </div>
          </div>
        </div>
      </nav>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu">
              ☰
            </button>
            <div>
              <div className="topbar-title">{sectionTitle}</div>
              <div style={{ color: "var(--text-muted)", fontSize: "12px", marginTop: "2px" }} className="desktop-only">
                /dev/geomodi-preview
              </div>
            </div>
          </div>
          <div className="topbar-context desktop-only">
            <span className="topbar-chip accent">Modo mock</span>
            <span className="topbar-chip">Sin login</span>
            <span className="topbar-chip subtle">Sync {lastRefreshLabel}</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setLastRefreshAt(new Date())}>
            Simular refresh
          </button>
        </header>

        <div className="content-area" style={{ display: "grid", gap: "20px", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.6fr) minmax(320px, 360px)", alignItems: "start" }}>
          <div>{renderSection()}</div>

          <aside style={{ display: "grid", gap: "20px", position: isMobile ? "static" : "sticky", top: isMobile ? "auto" : "92px" }}>
            <div className="card">
              <div style={{ fontSize: "12px", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--accent)", marginBottom: "8px" }}>
                Como usar
              </div>
              <div style={{ display: "grid", gap: "10px", color: "var(--text-secondary)", fontSize: "13px" }}>
                <div>1. Levantá `npm run dev` y abrí `http://localhost:3000/dev/geomodi-preview`.</div>
                <div>2. Tocá estilos/componentes y usá esta pantalla como referencia estable.</div>
                <div>3. Las pestañas `Tiendanube` y `Zipnova` también corren 100% en mock.</div>
                <div>4. Si tenés Google Maps configurado, la pestaña mapa usa el componente real.</div>
              </div>
            </div>

            <div className="card">
              <div className="flex-between" style={{ gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
                <h3 style={{ fontSize: "15px", fontWeight: 700 }}>🧪 Feed mock permanente</h3>
                <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>{allShipments.length} envios</span>
              </div>
              <div style={{ display: "grid", gap: "12px" }}>
                {allShipments.map((shipment) => {
                  const statusStyle = getStatusStyle(shipment.status);
                  const carrier = getCarrierMeta(shipment.assigned_carrier);

                  return (
                    <div key={shipment.id} style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "14px", background: "var(--bg-secondary)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
                        <div style={{ fontWeight: 700, color: "var(--text)", lineHeight: 1.4 }}>{shipment.product_name}</div>
                        <span className={`badge ${shipment.shipping_method === "flex" ? "badge-flex" : "badge-colecta"}`}>{shipment.shipping_method}</span>
                      </div>
                      <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>{shipment.recipient_name}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: "12px", marginTop: "2px" }}>{shipment.city}, {shipment.province}</div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
                        <span className="badge" style={statusStyle}>{shipment.status}</span>
                        <span className="badge" style={{ background: "rgba(148, 163, 184, 0.12)", color: "var(--text-secondary)" }}>{shipment.tracking_number}</span>
                        {carrier ? <span className="badge" style={{ background: `${carrier.color}22`, color: carrier.color }}>{carrier.display_name}</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

export default function DevGeomodiPreviewPage() {
  return (
    <Suspense fallback={(
      <main className="main-content" style={{ marginLeft: 0 }}>
        <div className="content-area">
          <div className="spinner"></div>
        </div>
      </main>
    )}>
      <DevGeomodiPreviewContent />
    </Suspense>
  );
}
