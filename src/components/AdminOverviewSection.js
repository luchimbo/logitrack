"use client";

import { useEffect, useState } from "react";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("es-AR");
}

export default function AdminOverviewSection() {
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [activity, setActivity] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUserDetail, setSelectedUserDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [overviewRes, usersRes, workspacesRes, activityRes] = await Promise.all([
        fetch("/api/admin/overview"),
        fetch("/api/admin/users"),
        fetch("/api/admin/workspaces"),
        fetch("/api/admin/activity?limit=30"),
      ]);

      const [overviewData, usersData, workspacesData, activityData] = await Promise.all([
        overviewRes.json(),
        usersRes.json(),
        workspacesRes.json(),
        activityRes.json(),
      ]);

      if (!overviewRes.ok) throw new Error(overviewData.error || "No se pudo cargar overview");
      if (!usersRes.ok) throw new Error(usersData.error || "No se pudo cargar usuarios");
      if (!workspacesRes.ok) throw new Error(workspacesData.error || "No se pudo cargar workspaces");
      if (!activityRes.ok) throw new Error(activityData.error || "No se pudo cargar actividad");

      setOverview(overviewData);
      setUsers(usersData.users || []);
      setWorkspaces(workspacesData.workspaces || []);
      setActivity(activityData.activity || []);
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
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el detalle del usuario');
      setSelectedUserDetail(data);
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading) {
    return <div className="spinner"></div>;
  }

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Admin Maestro</h2>
        <p className="section-subtitle">Vista global de usuarios, workspaces, actividad y métricas generales de LogiTrack.</p>
      </div>

      {error ? <div className="card" style={{ marginBottom: "12px", background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div> : null}

      <div className="stats-grid">
        <div className="stat-card card accent"><div className="stat-value">{overview?.totals?.users || 0}</div><div className="stat-label">Usuarios</div></div>
        <div className="stat-card card info"><div className="stat-value">{overview?.totals?.workspaces || 0}</div><div className="stat-label">Workspaces</div></div>
        <div className="stat-card card success"><div className="stat-value">{overview?.totals?.shipments || 0}</div><div className="stat-label">Envíos</div></div>
        <div className="stat-card card warning"><div className="stat-value">{overview?.totals?.batches || 0}</div><div className="stat-label">Lotes</div></div>
        <div className="stat-card card accent"><div className="stat-value">{overview?.totals?.activeToday || 0}</div><div className="stat-label">Activos hoy</div></div>
        <div className="stat-card card info"><div className="stat-value">{overview?.totals?.activeWeek || 0}</div><div className="stat-label">Activos 7 días</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px", marginBottom: "20px" }}>
        <div className="card">
          <div className="flex-between mb-md">
            <h3 style={{ fontSize: "16px", fontWeight: 700 }}>Usuarios recientes</h3>
            <button className="btn btn-sm btn-ghost" onClick={load}>Actualizar</button>
          </div>
          <div style={{ display: "grid", gap: "10px" }}>
            {(overview?.recentUsers || []).map((user) => (
              <div key={`${user.email}-${user.created_at}`} className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
                <div className="mobile-card-title">{user.email}</div>
                <div className="mobile-card-body" style={{ marginTop: "8px" }}>
                  <div className="mobile-card-row"><span className="mobile-card-label">Registro</span><span className="mobile-card-value">{formatDate(user.created_at)}</span></div>
                  <div className="mobile-card-row"><span className="mobile-card-label">Último uso</span><span className="mobile-card-value">{formatDate(user.last_seen_at)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>Top workspaces</h3>
          <div style={{ display: "grid", gap: "10px" }}>
            {(overview?.topWorkspaces || []).map((workspace) => (
              <div key={workspace.id} className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
                <div className="mobile-card-title">{workspace.name}</div>
                <div className="mobile-card-body" style={{ marginTop: "8px" }}>
                  <div className="mobile-card-row"><span className="mobile-card-label">Slug</span><span className="mobile-card-value">{workspace.slug}</span></div>
                  <div className="mobile-card-row"><span className="mobile-card-label">Miembros</span><span className="mobile-card-value">{workspace.members}</span></div>
                  <div className="mobile-card-row"><span className="mobile-card-label">Envíos</span><span className="mobile-card-value">{workspace.shipments}</span></div>
                  <div className="mobile-card-row"><span className="mobile-card-label">Lotes</span><span className="mobile-card-value">{workspace.batches}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "20px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>Usuarios registrados</h3>
        <div style={{ display: "grid", gap: "12px" }}>
          {users.map((u) => (
            <div key={u.id} className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
              <div className="mobile-card-title">{u.email}</div>
              <div className="mobile-card-body" style={{ marginTop: "8px" }}>
                <div className="mobile-card-row"><span className="mobile-card-label">Workspace</span><span className="mobile-card-value">{u.workspace_name || '-'}</span></div>
                <div className="mobile-card-row"><span className="mobile-card-label">Rol</span><span className="mobile-card-value">{u.role || '-'}</span></div>
                <div className="mobile-card-row"><span className="mobile-card-label">Registro</span><span className="mobile-card-value">{formatDate(u.created_at)}</span></div>
                <div className="mobile-card-row"><span className="mobile-card-label">Último uso</span><span className="mobile-card-value">{formatDate(u.last_seen_at)}</span></div>
                <div className="mobile-card-row"><span className="mobile-card-label">Lotes creados</span><span className="mobile-card-value">{u.batches_created || 0}</span></div>
                <div className="mobile-card-row"><span className="mobile-card-label">Paquetes subidos</span><span className="mobile-card-value">{u.packages_uploaded || 0}</span></div>
                <div className="mobile-card-row"><span className="mobile-card-label">Última actividad</span><span className="mobile-card-value">{formatDate(u.last_activity_at)}</span></div>
              </div>
              <div className="mobile-card-actions">
                <button className="btn btn-primary btn-sm" onClick={() => loadUserDetail(u.id)}>
                  {selectedUserId === String(u.id) ? 'Recargar detalle' : 'Ver detalle'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedUserId && (
        <div className="card" style={{ marginBottom: "20px" }}>
          <div className="flex-between mb-md" style={{ alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: '4px' }}>Detalle por usuario</h3>
              {selectedUserDetail?.user ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                  {selectedUserDetail.user.email} · {selectedUserDetail.workspace?.name || '-'}
                </p>
              ) : null}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedUserId(""); setSelectedUserDetail(null); }}>
              Cerrar detalle
            </button>
          </div>

          {detailLoading ? (
            <div className="spinner"></div>
          ) : selectedUserDetail ? (
            <div style={{ display: 'grid', gap: '18px' }}>
              <div className="stats-grid">
                <div className="stat-card card accent"><div className="stat-value">{selectedUserDetail.totals.shipments}</div><div className="stat-label">Envíos totales</div></div>
                <div className="stat-card card info"><div className="stat-value">{selectedUserDetail.totals.batches}</div><div className="stat-label">Lotes workspace</div></div>
                <div className="stat-card card success"><div className="stat-value">{selectedUserDetail.totals.userBatches}</div><div className="stat-label">Lotes creados</div></div>
                <div className="stat-card card warning"><div className="stat-value">{selectedUserDetail.totals.userPackages}</div><div className="stat-label">Paquetes subidos</div></div>
                <div className="stat-card card accent"><div className="stat-value">{selectedUserDetail.today.total}</div><div className="stat-label">Hoy total</div></div>
                <div className="stat-card card info"><div className="stat-value">{selectedUserDetail.today.flex}</div><div className="stat-label">Hoy flex</div></div>
                <div className="stat-card card success"><div className="stat-value">{selectedUserDetail.today.colecta}</div><div className="stat-label">Hoy colecta</div></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <div className="card">
                  <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Dashboard de hoy</h4>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {Object.entries(selectedUserDetail.today.byCarrier || {}).map(([carrier, count]) => (
                      <div key={carrier} className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
                        <div className="mobile-card-row"><span className="mobile-card-label">Carrier</span><span className="mobile-card-value">{carrier}</span></div>
                        <div className="mobile-card-row"><span className="mobile-card-label">Flex</span><span className="mobile-card-value">{count}</span></div>
                      </div>
                    ))}
                    {Object.entries(selectedUserDetail.today.byProvince || {}).slice(0, 5).map(([province, count]) => (
                      <div key={province} className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
                        <div className="mobile-card-row"><span className="mobile-card-label">Provincia</span><span className="mobile-card-value">{province}</span></div>
                        <div className="mobile-card-row"><span className="mobile-card-label">Envíos</span><span className="mobile-card-value">{count}</span></div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Horarios de uso</h4>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {(selectedUserDetail.activityByHour || []).map((slot) => (
                      <div key={slot.hour} className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
                        <div className="mobile-card-row"><span className="mobile-card-label">Hora</span><span className="mobile-card-value">{slot.hour}:00</span></div>
                        <div className="mobile-card-row"><span className="mobile-card-label">Acciones</span><span className="mobile-card-value">{slot.count}</span></div>
                      </div>
                    ))}
                    {(!selectedUserDetail.activityByHour || selectedUserDetail.activityByHour.length === 0) && (
                      <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Sin actividad registrada todavía.</p>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <div className="card">
                  <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Picking actual</h4>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {[...(selectedUserDetail.picking.colecta || []), ...(selectedUserDetail.picking.flex || [])].slice(0, 12).map((item, idx) => (
                      <div key={`${item.product_name}-${idx}`} className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
                        <div className="mobile-card-title">{item.product_name}</div>
                        <div className="mobile-card-body" style={{ marginTop: '8px' }}>
                          <div className="mobile-card-row"><span className="mobile-card-label">Método</span><span className="mobile-card-value">{item.shipping_method}</span></div>
                          <div className="mobile-card-row"><span className="mobile-card-label">Cantidad</span><span className="mobile-card-value">{item.total_quantity}</span></div>
                          <div className="mobile-card-row"><span className="mobile-card-label">Envíos</span><span className="mobile-card-value">{item.shipment_count}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Transportistas del workspace</h4>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {(selectedUserDetail.carriers || []).map((carrier) => (
                      <div key={carrier.id} className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
                        <div className="mobile-card-title">{carrier.display_name || carrier.name}</div>
                        <div className="mobile-card-body" style={{ marginTop: '8px' }}>
                          <div className="mobile-card-row"><span className="mobile-card-label">Nombre</span><span className="mobile-card-value">{carrier.name}</span></div>
                          <div className="mobile-card-row"><span className="mobile-card-label">Color</span><span className="mobile-card-value">{carrier.color || '-'}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <div className="card">
                  <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Lotes recientes</h4>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {(selectedUserDetail.recentBatches || []).map((batch) => (
                      <div key={batch.id} className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
                        <div className="mobile-card-title">Lote #{batch.id}</div>
                        <div className="mobile-card-body" style={{ marginTop: '8px' }}>
                          <div className="mobile-card-row"><span className="mobile-card-label">Fecha</span><span className="mobile-card-value">{batch.date}</span></div>
                          <div className="mobile-card-row"><span className="mobile-card-label">Paquetes</span><span className="mobile-card-value">{batch.total_packages}</span></div>
                          <div className="mobile-card-row"><span className="mobile-card-label">Archivos</span><span className="mobile-card-value">{batch.filenames || '-'}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Actividad reciente del usuario</h4>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {(selectedUserDetail.recentActivity || []).map((item, idx) => (
                      <div key={`${item.created_at}-${idx}`} className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
                        <div className="mobile-card-title">{item.action}</div>
                        <div className="mobile-card-body" style={{ marginTop: '8px' }}>
                          <div className="mobile-card-row"><span className="mobile-card-label">Actor</span><span className="mobile-card-value">{item.actor_label || item.actor_type}</span></div>
                          <div className="mobile-card-row"><span className="mobile-card-label">Entidad</span><span className="mobile-card-value">{item.entity_type || '-'} {item.entity_id ? `#${item.entity_id}` : ''}</span></div>
                          <div className="mobile-card-row"><span className="mobile-card-label">Fecha</span><span className="mobile-card-value">{formatDate(item.created_at)}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Seleccioná un usuario para ver su detalle operativo.</p>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: "20px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>Workspaces</h3>
        <div style={{ display: "grid", gap: "12px" }}>
          {workspaces.map((w) => (
            <div key={w.id} className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
              <div className="mobile-card-title">{w.name}</div>
              <div className="mobile-card-body" style={{ marginTop: "8px" }}>
                <div className="mobile-card-row"><span className="mobile-card-label">Owner</span><span className="mobile-card-value">{w.owner_email || '-'}</span></div>
                <div className="mobile-card-row"><span className="mobile-card-label">Creado</span><span className="mobile-card-value">{formatDate(w.created_at)}</span></div>
                <div className="mobile-card-row"><span className="mobile-card-label">Miembros</span><span className="mobile-card-value">{w.members || 0}</span></div>
                <div className="mobile-card-row"><span className="mobile-card-label">Envíos</span><span className="mobile-card-value">{w.shipments || 0}</span></div>
                <div className="mobile-card-row"><span className="mobile-card-label">Lotes</span><span className="mobile-card-value">{w.batches || 0}</span></div>
                <div className="mobile-card-row"><span className="mobile-card-label">Última actividad</span><span className="mobile-card-value">{formatDate(w.last_activity_at)}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "12px" }}>Actividad reciente</h3>
        <div style={{ display: "grid", gap: "12px" }}>
          {activity.map((item) => (
            <div key={item.id} className="mobile-card" style={{ display: "block", marginBottom: 0 }}>
              <div className="mobile-card-title">{item.actor_label || item.app_user_email || item.actor_type}</div>
              <div className="mobile-card-body" style={{ marginTop: "8px" }}>
                <div className="mobile-card-row"><span className="mobile-card-label">Acción</span><span className="mobile-card-value">{item.action}</span></div>
                <div className="mobile-card-row"><span className="mobile-card-label">Workspace</span><span className="mobile-card-value">{item.workspace_name || '-'}</span></div>
                <div className="mobile-card-row"><span className="mobile-card-label">Entidad</span><span className="mobile-card-value">{item.entity_type || '-'} {item.entity_id ? `#${item.entity_id}` : ''}</span></div>
                <div className="mobile-card-row"><span className="mobile-card-label">Fecha</span><span className="mobile-card-value">{formatDate(item.created_at)}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
