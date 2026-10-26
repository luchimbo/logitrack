"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { EmptyState, Badge, Skeleton } from "@/components/ui";

const TYPE_LABELS = {
  producto_faltante: "Producto faltante",
  stock_insuficiente: "Stock insuficiente",
  producto_danado: "Producto dañado",
  direccion_invalida: "Dirección inválida",
  problema_etiqueta: "Problema con etiqueta",
  reemplazo_producto: "Reemplazo de producto",
  otro: "Otro",
};

const STATUS_LABELS = {
  open: "Abierta",
  in_progress: "En progreso",
  resolved: "Resuelta",
  cancelled: "Cancelada",
};

function typeLabel(type) {
  return TYPE_LABELS[type] || type || "Desconocido";
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || "Sin estado";
}

export default function IncidentsSection() {
  const [incidents, setIncidents] = useState([]);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [newComment, setNewComment] = useState("");

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = status === "all" ? "" : `?status=${encodeURIComponent(status)}`;
      const data = await api(`/incidents${qs}`);
      setIncidents(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  const fetchIncidentDetail = useCallback(async (id) => {
    if (!id) return;
    setDetailLoading(true);
    setError(null);
    try {
      const data = await api(`/incidents/${id}`);
      setSelectedIncident(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  useEffect(() => {
    fetchIncidentDetail(selectedIncidentId);
  }, [fetchIncidentDetail, selectedIncidentId]);

  async function updateIncident(statusValue) {
    if (!selectedIncidentId) return;
    setActionLoading(true);
    setError(null);
    try {
      const body = { status: statusValue };
      if (newComment.trim()) {
        body.comment = newComment.trim();
      }
      await api(`/incidents/${selectedIncidentId}`, { method: "PATCH", body: JSON.stringify(body) });
      setNewComment("");
      await Promise.all([fetchIncidents(), fetchIncidentDetail(selectedIncidentId)]);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="section active">
      <div className="section-header">
        <h1 className="section-title">Incidencias</h1>
        <p className="section-subtitle">Problemas operativos trazables por pedido.</p>
      </div>

      <div className="card" style={{ marginBottom: "16px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-muted)" }}>Estado</label>
        <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: "200px" }}>
          <option value="all">Todas</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {loading && <Skeleton count={5} />}

      {error && <p style={{ color: "var(--danger)" }}>Error: {error}</p>}

      {!loading && !error && incidents.length === 0 && (
        <EmptyState
          icon="✅"
          title="Todo en orden"
          description="No hay incidencias registradas. Podés crear incidencias desde el detalle de un pedido."
          secondaryActionLabel="Ver pedidos"
          onSecondaryAction={() => {
            const event = new CustomEvent("navigate", { detail: "orders" });
            window.dispatchEvent(event);
          }}
        />
      )}

      {!loading && !error && incidents.length > 0 && (
        <div className="table-container" style={{ marginBottom: "16px" }}>
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Pedido</th>
                <th>Estado</th>
                <th>Comentarios</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => (
                <tr key={inc.id} onClick={() => setSelectedIncidentId(inc.id)} style={{ cursor: "pointer", background: selectedIncidentId === inc.id ? "var(--bg-secondary)" : undefined }}>
                  <td style={{ fontWeight: 700 }}>{typeLabel(inc.type)}</td>
                  <td>{inc.order_number || inc.order_external_id || `#${inc.order_id}`}</td>
                  <td><span className="badge">{statusLabel(inc.status)}</span></td>
                  <td>{Number(inc.comment_count || 0)}</td>
                  <td>{inc.created_at ? new Date(inc.created_at).toLocaleString("es-AR") : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedIncidentId && (
        <div className="card">
          {detailLoading && <div className="spinner"></div>}

          {!detailLoading && selectedIncident && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap", marginBottom: "16px" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "18px" }}>{typeLabel(selectedIncident.incident.type)}</h2>
                  <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: "13px" }}>
                    Pedido {selectedIncident.incident.order_number || selectedIncident.incident.order_external_id || `#${selectedIncident.incident.order_id}`}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {selectedIncident.incident.status !== "resolved" && (
                    <button className="btn btn-primary" disabled={actionLoading} onClick={() => updateIncident("resolved")}>Resolver</button>
                  )}
                  {selectedIncident.incident.status === "open" && (
                    <button className="btn" disabled={actionLoading} onClick={() => updateIncident("in_progress")}>En progreso</button>
                  )}
                  {selectedIncident.incident.status !== "cancelled" && selectedIncident.incident.status !== "resolved" && (
                    <button className="btn btn-danger" disabled={actionLoading} onClick={() => updateIncident("cancelled")}>Cancelar</button>
                  )}
                </div>
              </div>

              {selectedIncident.incident.description && (
                <div className="mobile-card" style={{ display: "block", marginBottom: "16px" }}>
                  <div className="mobile-card-label">Descripción</div>
                  <div className="mobile-card-title">{selectedIncident.incident.description}</div>
                </div>
              )}

              {selectedIncident.comments.length > 0 && (
                <div style={{ marginBottom: "16px" }}>
                  <h3 style={{ fontSize: "15px", marginBottom: "12px" }}>Comentarios</h3>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {selectedIncident.comments.map((c) => (
                      <div key={c.id} style={{ fontSize: "13px", color: "var(--text-muted)", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
                        {c.comment} · {c.created_at ? new Date(c.created_at).toLocaleString("es-AR") : ""}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Agregar comentario..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  style={{ flex: 1, minWidth: "200px" }}
                />
                <button className="btn btn-sm" disabled={actionLoading || !newComment.trim()} onClick={() => updateIncident(selectedIncident.incident.status)}>Comentar</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
