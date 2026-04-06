"use client";

import { useEffect, useMemo, useState } from "react";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-AR");
}

export default function AdminOverviewSection() {
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUserDetail, setSelectedUserDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userQuery, setUserQuery] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [overviewRes, usersRes] = await Promise.all([
        fetch("/api/admin/overview"),
        fetch("/api/admin/users"),
      ]);

      const [overviewData, usersData] = await Promise.all([
        overviewRes.json(),
        usersRes.json(),
      ]);

      if (!overviewRes.ok) throw new Error(overviewData.error || "No se pudo cargar overview");
      if (!usersRes.ok) throw new Error(usersData.error || "No se pudo cargar usuarios");

      setOverview(overviewData);
      setUsers(usersData.users || []);
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const loadUserDetail = async (userId) => {
    setSelectedUserId(String(userId));
    setDetailLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar el detalle del usuario");
      setSelectedUserDetail(data);
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setDetailLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.email, u.workspace_name, u.workspace_slug, u.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [users, userQuery]);

  const selectedSummary = users.find((u) => String(u.id) === selectedUserId);

  if (loading) {
    return <div className="spinner"></div>;
  }

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Admin Maestro</h2>
        <p className="section-subtitle">Elegí un usuario para ver su operación completa y sus horarios de uso.</p>
      </div>

      {error ? (
        <div className="card" style={{ marginBottom: "12px", background: "var(--danger-bg)", color: "var(--danger)" }}>
          {error}
        </div>
      ) : null}

      <div className="stats-grid">
        <div className="stat-card card accent"><div className="stat-value">{overview?.totals?.users || 0}</div><div className="stat-label">Usuarios</div></div>
        <div className="stat-card card info"><div className="stat-value">{overview?.totals?.workspaces || 0}</div><div className="stat-label">Workspaces</div></div>
        <div className="stat-card card success"><div className="stat-value">{overview?.totals?.shipments || 0}</div><div className="stat-label">Envíos</div></div>
        <div className="stat-card card warning"><div className="stat-value">{overview?.totals?.batches || 0}</div><div className="stat-label">Lotes</div></div>
        <div className="stat-card card accent"><div className="stat-value">{overview?.totals?.activeToday || 0}</div><div className="stat-label">Activos hoy</div></div>
        <div className="stat-card card info"><div className="stat-value">{overview?.totals?.activeWeek || 0}</div><div className="stat-label">Activos 7 días</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 380px) minmax(0, 1fr)", gap: "20px", alignItems: "start" }}>
        <div className="card">
          <div className="flex-between mb-md" style={{ alignItems: "flex-end", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "4px" }}>Elegir usuario</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Seleccioná un usuario y cargamos su panel completo.</p>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={load}>Actualizar</button>
          </div>

          <div className="form-group" style={{ marginBottom: "14px" }}>
            <input
              type="text"
              className="form-input"
              placeholder="Buscar por email, workspace o rol"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
            />
          </div>

          <div style={{ display: "grid", gap: "10px", maxHeight: "70vh", overflowY: "auto", paddingRight: "4px" }}>
            {filteredUsers.map((u) => {
              const selected = selectedUserId === String(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => loadUserDetail(u.id)}
                  className="mobile-card"
                  style={{
                    display: "block",
                    marginBottom: 0,
                    textAlign: "left",
                    background: selected ? "var(--accent-light)" : undefined,
                    borderColor: selected ? "var(--accent)" : undefined,
                  }}
                >
                  <div className="mobile-card-title">{u.email}</div>
                  <div className="mobile-card-body" style={{ marginTop: "8px" }}>
                    <div className="mobile-card-row"><span className="mobile-card-label">Workspace</span><span className="mobile-card-value">{u.workspace_name || "-"}</span></div>
                    <div className="mobile-card-row"><span className="mobile-card-label">Rol</span><span className="mobile-card-value">{u.role || "-"}</span></div>
                    <div className="mobile-card-row"><span className="mobile-card-label">Último uso</span><span className="mobile-card-value">{formatDate(u.last_seen_at)}</span></div>
                    <div className="mobile-card-row"><span className="mobile-card-label">Paquetes subidos</span><span className="mobile-card-value">{u.packages_uploaded || 0}</span></div>
                  </div>
                </button>
              );
            })}

            {filteredUsers.length === 0 && (
              <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>No hay usuarios que coincidan con la búsqueda.</p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex-between mb-md" style={{ alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "4px" }}>Panel del usuario</h3>
              {selectedUserDetail?.user ? (
                <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                  {selectedUserDetail.user.email} · {selectedUserDetail.workspace?.name || "-"} · {selectedUserDetail.user.role || "-"}
                </p>
              ) : selectedSummary ? (
                <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                  {selectedSummary.email} · {selectedSummary.workspace_name || "-"}
                </p>
              ) : (
                <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Todavía no elegiste un usuario.</p>
              )}
            </div>

            {selectedUserId ? (
              <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedUserId(""); setSelectedUserDetail(null); }}>
                Limpiar selección
              </button>
            ) : null}
          </div>

          {detailLoading ? (
            <div className="spinner"></div>
          ) : selectedUserDetail ? (
            <div style={{ display: "grid", gap: "18px" }}>
              <div className="stats-grid">
                <div className="stat-card card accent"><div className="stat-value">{selectedUserDetail.totals.shipments}</div><div className="stat-label">Envíos totales</div></div>
                <div className="stat-card card info"><div className="stat-value">{selectedUserDetail.totals.batches}</div><div className="stat-label">Lotes workspace</div></div>
                <div className="stat-card card success"><div className="stat-value">{selectedUserDetail.totals.userBatches}</div><div className="stat-label">Lotes creados</div></div>
                <div className="stat-card card warning"><div className="stat-value">{selectedUserDetail.totals.userPackages}</div><div className="stat-label">Paquetes subidos</div></div>
                <div className="stat-card card accent"><div className="stat-value">{selectedUserDetail.today.total}</div><div className="stat-label">Hoy total</div></div>
                <div className="stat-card card info"><div className="stat-value">{selectedUserDetail.today.flex}</div><div className="stat-label">Hoy flex</div></div>
                <div className="stat-card card success"><div className="stat-value">{selectedUserDetail.today.colecta}</div><div className="stat-label">Hoy colecta</div></div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                <div className="card">
                  <h4 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "12px" }}>Resumen operativo de hoy</h4>
                  <div style={{ display: "grid", gap: "8px" }}>
                    <div className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
                      <div className="mobile-card-row"><span className="mobile-card-label">Total hoy</span><span className="mobile-card-value">{selectedUserDetail.today.total}</span></div>
                      <div className="mobile-card-row"><span className="mobile-card-label">Colecta</span><span className="mobile-card-value">{selectedUserDetail.today.colecta}</span></div>
                      <div className="mobile-card-row"><span className="mobile-card-label">Flex</span><span className="mobile-card-value">{selectedUserDetail.today.flex}</span></div>
                    </div>
                    {Object.entries(selectedUserDetail.today.byCarrier || {}).map(([carrier, count]) => (
                      <div key={carrier} className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
                        <div className="mobile-card-row"><span className="mobile-card-label">Transportista</span><span className="mobile-card-value">{carrier}</span></div>
                        <div className="mobile-card-row"><span className="mobile-card-label">Flex</span><span className="mobile-card-value">{count}</span></div>
                      </div>
                    ))}
                    {Object.entries(selectedUserDetail.today.byProvince || {}).slice(0, 5).map(([province, count]) => (
                      <div key={province} className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
                        <div className="mobile-card-row"><span className="mobile-card-label">Provincia</span><span className="mobile-card-value">{province}</span></div>
                        <div className="mobile-card-row"><span className="mobile-card-label">Envíos</span><span className="mobile-card-value">{count}</span></div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <h4 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "12px" }}>Horarios de uso</h4>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {(selectedUserDetail.activityByHour || []).map((slot) => (
                      <div key={slot.hour} className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
                        <div className="mobile-card-row"><span className="mobile-card-label">Hora</span><span className="mobile-card-value">{slot.hour}:00</span></div>
                        <div className="mobile-card-row"><span className="mobile-card-label">Acciones</span><span className="mobile-card-value">{slot.count}</span></div>
                      </div>
                    ))}
                    {(!selectedUserDetail.activityByHour || selectedUserDetail.activityByHour.length === 0) && (
                      <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Sin actividad registrada todavía.</p>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                <div className="card">
                  <h4 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "12px" }}>Listado de picking actual</h4>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {[...(selectedUserDetail.picking.colecta || []), ...(selectedUserDetail.picking.flex || [])].slice(0, 12).map((item, idx) => (
                      <div key={`${item.product_name}-${idx}`} className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
                        <div className="mobile-card-title">{item.product_name}</div>
                        <div className="mobile-card-body" style={{ marginTop: "8px" }}>
                          <div className="mobile-card-row"><span className="mobile-card-label">Método</span><span className="mobile-card-value">{item.shipping_method}</span></div>
                          <div className="mobile-card-row"><span className="mobile-card-label">Cantidad</span><span className="mobile-card-value">{item.total_quantity}</span></div>
                          <div className="mobile-card-row"><span className="mobile-card-label">Envíos</span><span className="mobile-card-value">{item.shipment_count}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <h4 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "12px" }}>Transportistas configurados</h4>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {(selectedUserDetail.carriers || []).map((carrier) => (
                      <div key={carrier.id} className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
                        <div className="mobile-card-title">{carrier.display_name || carrier.name}</div>
                        <div className="mobile-card-body" style={{ marginTop: "8px" }}>
                          <div className="mobile-card-row"><span className="mobile-card-label">Nombre</span><span className="mobile-card-value">{carrier.name}</span></div>
                          <div className="mobile-card-row"><span className="mobile-card-label">Color</span><span className="mobile-card-value">{carrier.color || "-"}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                <div className="card">
                  <h4 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "12px" }}>Lotes recientes</h4>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {(selectedUserDetail.recentBatches || []).map((batch) => (
                      <div key={batch.id} className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
                        <div className="mobile-card-title">Lote #{batch.id}</div>
                        <div className="mobile-card-body" style={{ marginTop: "8px" }}>
                          <div className="mobile-card-row"><span className="mobile-card-label">Fecha</span><span className="mobile-card-value">{batch.date}</span></div>
                          <div className="mobile-card-row"><span className="mobile-card-label">Paquetes</span><span className="mobile-card-value">{batch.total_packages}</span></div>
                          <div className="mobile-card-row"><span className="mobile-card-label">Archivos</span><span className="mobile-card-value">{batch.filenames || "-"}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <h4 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "12px" }}>Actividad reciente del usuario</h4>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {(selectedUserDetail.recentActivity || []).map((item, idx) => (
                      <div key={`${item.created_at}-${idx}`} className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
                        <div className="mobile-card-title">{item.action}</div>
                        <div className="mobile-card-body" style={{ marginTop: "8px" }}>
                          <div className="mobile-card-row"><span className="mobile-card-label">Actor</span><span className="mobile-card-value">{item.actor_label || item.actor_type}</span></div>
                          <div className="mobile-card-row"><span className="mobile-card-label">Entidad</span><span className="mobile-card-value">{item.entity_type || "-"} {item.entity_id ? `#${item.entity_id}` : ""}</span></div>
                          <div className="mobile-card-row"><span className="mobile-card-label">Fecha</span><span className="mobile-card-value">{formatDate(item.created_at)}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: "30px 12px" }}>
              <div className="empty-state-icon">👤</div>
              <p className="empty-state-text">Elegí un usuario desde la columna izquierda para cargar su panel operativo.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
