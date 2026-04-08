"use client";

import { useEffect, useMemo, useState } from "react";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-AR");
}

function SummaryMetric({ value, label, tone = "accent" }) {
  return (
    <div className={`stat-card card ${tone}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function AdminOverviewSection() {
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeView, setActiveView] = useState("users");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUserDetail, setSelectedUserDetail] = useState(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [selectedWorkspaceDetail, setSelectedWorkspaceDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [overviewRes, usersRes, workspacesRes] = await Promise.all([
        fetch("/api/admin/overview"),
        fetch("/api/admin/users"),
        fetch("/api/admin/workspaces"),
      ]);

      const [overviewData, usersData, workspacesData] = await Promise.all([
        overviewRes.json(),
        usersRes.json(),
        workspacesRes.json(),
      ]);

      if (!overviewRes.ok) throw new Error(overviewData.error || "No se pudo cargar overview");
      if (!usersRes.ok) throw new Error(usersData.error || "No se pudo cargar usuarios");
      if (!workspacesRes.ok) throw new Error(workspacesData.error || "No se pudo cargar workspaces");

      setOverview(overviewData);
      setUsers(usersData.users || []);
      setWorkspaces(workspacesData.workspaces || []);
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
    setSelectedWorkspaceId("");
    setSelectedWorkspaceDetail(null);
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

  const loadWorkspaceDetail = async (workspaceId) => {
    setSelectedWorkspaceId(String(workspaceId));
    setSelectedUserId("");
    setSelectedUserDetail(null);
    setDetailLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/workspaces/${workspaceId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar el detalle del workspace");
      setSelectedWorkspaceDetail(data);
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setDetailLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => [u.email, u.workspace_name, u.workspace_slug, u.role].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [users, query]);

  const filteredWorkspaces = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter((w) => [w.name, w.slug, w.owner_email].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [workspaces, query]);

  if (loading) return <div className="spinner"></div>;

  const selectedWorkspaceSummary = workspaces.find((w) => String(w.id) === selectedWorkspaceId);
  const selectedUserSummary = users.find((u) => String(u.id) === selectedUserId);

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Admin Maestro</h2>
        <p className="section-subtitle">Vista global de GeoModi. Elegí usuarios o workspaces para ver su operación sin cambiar de sesión.</p>
      </div>

      {error ? <div className="card" style={{ marginBottom: 12, background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div> : null}

      <div className="stats-grid">
        <SummaryMetric value={overview?.totals?.users || 0} label="Usuarios" tone="accent" />
        <SummaryMetric value={overview?.totals?.workspaces || 0} label="Workspaces" tone="info" />
        <SummaryMetric value={overview?.totals?.shipments || 0} label="Envíos" tone="success" />
        <SummaryMetric value={overview?.totals?.batches || 0} label="Lotes" tone="warning" />
        <SummaryMetric value={overview?.totals?.activeToday || 0} label="Activos hoy" tone="accent" />
        <SummaryMetric value={overview?.totals?.activeWeek || 0} label="Activos 7 días" tone="info" />
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className={`btn btn-sm ${activeView === "users" ? "btn-primary" : "btn-ghost"}`} onClick={() => setActiveView("users")}>Usuarios</button>
          <button className={`btn btn-sm ${activeView === "workspaces" ? "btn-primary" : "btn-ghost"}`} onClick={() => setActiveView("workspaces")}>Workspaces</button>
          <button className="btn btn-sm btn-ghost" onClick={load}>Actualizar</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 390px) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
        <div className="card">
          <div className="form-group" style={{ marginBottom: 14 }}>
            <input
              type="text"
              className="form-input"
              placeholder={activeView === "users" ? "Buscar por email, workspace o rol" : "Buscar por nombre, slug u owner"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div style={{ display: "grid", gap: 10, maxHeight: "72vh", overflowY: "auto", paddingRight: 4 }}>
            {activeView === "users" ? filteredUsers.map((u) => {
              const selected = selectedUserId === String(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => loadUserDetail(u.id)}
                  className="mobile-card"
                  style={{ display: "block", marginBottom: 0, textAlign: "left", background: selected ? "var(--accent-light)" : undefined, borderColor: selected ? "var(--accent)" : undefined }}
                >
                  <div className="mobile-card-title">{u.email}</div>
                  <div className="mobile-card-body" style={{ marginTop: 8 }}>
                    <div className="mobile-card-row"><span className="mobile-card-label">Workspace</span><span className="mobile-card-value">{u.workspace_name || "-"}</span></div>
                    <div className="mobile-card-row"><span className="mobile-card-label">Rol</span><span className="mobile-card-value">{u.role || "-"}</span></div>
                    <div className="mobile-card-row"><span className="mobile-card-label">Último uso</span><span className="mobile-card-value">{formatDate(u.last_seen_at)}</span></div>
                    <div className="mobile-card-row"><span className="mobile-card-label">Paquetes</span><span className="mobile-card-value">{u.packages_uploaded || 0}</span></div>
                  </div>
                </button>
              );
            }) : filteredWorkspaces.map((w) => {
              const selected = selectedWorkspaceId === String(w.id);
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => loadWorkspaceDetail(w.id)}
                  className="mobile-card"
                  style={{ display: "block", marginBottom: 0, textAlign: "left", background: selected ? "var(--accent-light)" : undefined, borderColor: selected ? "var(--accent)" : undefined }}
                >
                  <div className="mobile-card-title">{w.name}</div>
                  <div className="mobile-card-body" style={{ marginTop: 8 }}>
                    <div className="mobile-card-row"><span className="mobile-card-label">Owner</span><span className="mobile-card-value">{w.owner_email || "-"}</span></div>
                    <div className="mobile-card-row"><span className="mobile-card-label">Miembros</span><span className="mobile-card-value">{w.members || 0}</span></div>
                    <div className="mobile-card-row"><span className="mobile-card-label">Envíos</span><span className="mobile-card-value">{w.shipments || 0}</span></div>
                  </div>
                </button>
              );
            })}

            {(activeView === "users" ? filteredUsers.length : filteredWorkspaces.length) === 0 && (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                {activeView === "users" ? "No hay usuarios que coincidan con la búsqueda." : "No hay workspaces que coincidan con la búsqueda."}
              </p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex-between mb-md" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{activeView === "users" ? "Panel del usuario" : "Panel del workspace"}</h3>
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                {activeView === "users"
                  ? (selectedUserDetail?.user ? `${selectedUserDetail.user.email} · ${selectedUserDetail.workspace?.name || "-"}` : selectedUserSummary ? `${selectedUserSummary.email} · ${selectedUserSummary.workspace_name || "-"}` : "Elegí un usuario para ver su operación")
                  : (selectedWorkspaceDetail?.workspace ? `${selectedWorkspaceDetail.workspace.name} · owner ${selectedWorkspaceDetail.workspace.owner_email || "-"}` : selectedWorkspaceSummary ? `${selectedWorkspaceSummary.name} · ${selectedWorkspaceSummary.owner_email || "-"}` : "Elegí un workspace para ver su operación")}
              </p>
            </div>

            {(selectedUserId || selectedWorkspaceId) ? (
              <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedUserId(""); setSelectedUserDetail(null); setSelectedWorkspaceId(""); setSelectedWorkspaceDetail(null); }}>
                Limpiar selección
              </button>
            ) : null}
          </div>

          {detailLoading ? (
            <div className="spinner"></div>
          ) : activeView === "users" && selectedUserDetail ? (
            <div style={{ display: "grid", gap: 18 }}>
              <div className="stats-grid">
                <SummaryMetric value={selectedUserDetail.totals.shipments} label="Envíos" tone="accent" />
                <SummaryMetric value={selectedUserDetail.totals.batches} label="Lotes workspace" tone="info" />
                <SummaryMetric value={selectedUserDetail.totals.userBatches} label="Lotes creados" tone="success" />
                <SummaryMetric value={selectedUserDetail.totals.userPackages} label="Paquetes subidos" tone="warning" />
                <SummaryMetric value={selectedUserDetail.today.total} label="Hoy total" tone="accent" />
                <SummaryMetric value={selectedUserDetail.today.flex} label="Hoy flex" tone="info" />
                <SummaryMetric value={selectedUserDetail.today.colecta} label="Hoy colecta" tone="success" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                <div className="card">
                  <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Resumen operativo de hoy</h4>
                  <div style={{ display: "grid", gap: 8 }}>
                    <div className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
                      <div className="mobile-card-row"><span className="mobile-card-label">Total hoy</span><span className="mobile-card-value">{selectedUserDetail.today.total}</span></div>
                      <div className="mobile-card-row"><span className="mobile-card-label">Colecta</span><span className="mobile-card-value">{selectedUserDetail.today.colecta}</span></div>
                      <div className="mobile-card-row"><span className="mobile-card-label">Flex</span><span className="mobile-card-value">{selectedUserDetail.today.flex}</span></div>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Horarios de uso</h4>
                  <div style={{ display: "grid", gap: 8 }}>
                    {(selectedUserDetail.activityByHour || []).map((slot) => (
                      <div key={slot.hour} className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
                        <div className="mobile-card-row"><span className="mobile-card-label">Hora</span><span className="mobile-card-value">{slot.hour}:00</span></div>
                        <div className="mobile-card-row"><span className="mobile-card-label">Acciones</span><span className="mobile-card-value">{slot.count}</span></div>
                      </div>
                    ))}
                    {(!selectedUserDetail.activityByHour || selectedUserDetail.activityByHour.length === 0) && <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Sin actividad registrada todavía.</p>}
                  </div>
                </div>
              </div>
            </div>
          ) : activeView === "workspaces" && selectedWorkspaceDetail ? (
            <div style={{ display: "grid", gap: 18 }}>
              <div className="stats-grid">
                <SummaryMetric value={selectedWorkspaceDetail.totals.shipments} label="Envíos" tone="accent" />
                <SummaryMetric value={selectedWorkspaceDetail.totals.batches} label="Lotes" tone="info" />
                <SummaryMetric value={selectedWorkspaceDetail.totals.shipments7d} label="Envíos 7 días" tone="success" />
                <SummaryMetric value={selectedWorkspaceDetail.totals.shipmentsMonth} label="Envíos mes" tone="warning" />
                <SummaryMetric value={selectedWorkspaceDetail.today.total} label="Hoy total" tone="accent" />
                <SummaryMetric value={selectedWorkspaceDetail.today.flex} label="Hoy flex" tone="info" />
                <SummaryMetric value={selectedWorkspaceDetail.today.colecta} label="Hoy colecta" tone="success" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                <div className="card">
                  <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Miembros</h4>
                  <div style={{ display: "grid", gap: 8 }}>
                    {(selectedWorkspaceDetail.members || []).map((member, idx) => (
                      <div key={`${member.email}-${idx}`} className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
                        <div className="mobile-card-row"><span className="mobile-card-label">Email</span><span className="mobile-card-value">{member.email}</span></div>
                        <div className="mobile-card-row"><span className="mobile-card-label">Rol</span><span className="mobile-card-value">{member.role}</span></div>
                        <div className="mobile-card-row"><span className="mobile-card-label">Último uso</span><span className="mobile-card-value">{formatDate(member.last_seen_at)}</span></div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <h4 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Resumen operativo de hoy</h4>
                  <div style={{ display: "grid", gap: 8 }}>
                    <div className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
                      <div className="mobile-card-row"><span className="mobile-card-label">Total hoy</span><span className="mobile-card-value">{selectedWorkspaceDetail.today.total}</span></div>
                      <div className="mobile-card-row"><span className="mobile-card-label">Colecta</span><span className="mobile-card-value">{selectedWorkspaceDetail.today.colecta}</span></div>
                      <div className="mobile-card-row"><span className="mobile-card-label">Flex</span><span className="mobile-card-value">{selectedWorkspaceDetail.today.flex}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: "30px 12px" }}>
              <div className="empty-state-icon">{activeView === "users" ? "👤" : "🏢"}</div>
              <p className="empty-state-text">
                {activeView === "users"
                  ? "Elegí un usuario desde la columna izquierda para cargar su panel operativo."
                  : "Elegí un workspace desde la columna izquierda para cargar su operación consolidada."}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
