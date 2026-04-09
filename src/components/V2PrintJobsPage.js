"use client";

import { useCallback, useEffect, useState } from "react";
import { api, toast } from "@/lib/api";

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("es-AR");
}

export default function V2PrintJobsPage() {
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState({ total_jobs: 0, total_labels: 0, total_reprints: 0 });
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [detail, setDetail] = useState(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api("/v2/print-jobs?limit=100");
      setSummary(data.summary || { total_jobs: 0, total_labels: 0, total_reprints: 0 });
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
      if (data.jobs?.length && !selectedJobId) {
        setSelectedJobId(data.jobs[0].job_id);
      }
    } catch (err) {
      setError(err.message || "Error cargando print jobs");
    } finally {
      setLoading(false);
    }
  }, [selectedJobId]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (!selectedJobId) {
      setDetail(null);
      return;
    }

    async function loadDetail() {
      setLoadingDetail(true);
      try {
        const data = await api(`/v2/print-jobs/${encodeURIComponent(selectedJobId)}`);
        setDetail(data);
      } catch (err) {
        toast("Error cargando detalle del job", "error");
        setDetail(null);
      } finally {
        setLoadingDetail(false);
      }
    }

    loadDetail();
  }, [selectedJobId]);

  return (
    <div className="section active">
      <div className="section-header flex-between">
        <div>
          <h1 className="section-title">🖨️ Print Jobs V2</h1>
          <p className="section-subtitle">Historial de impresion y reimpresiones</p>
        </div>
        <button className="btn btn-sm" onClick={loadJobs} disabled={loading}>
          {loading ? "Actualizando..." : "🔄 Actualizar"}
        </button>
      </div>

      {error && <p style={{ color: "var(--danger)", marginBottom: "12px" }}>Error: {error}</p>}

      <div className="stats-grid">
        <div className="stat-card card accent">
          <div className="stat-value">{summary.total_jobs || 0}</div>
          <div className="stat-label">Jobs</div>
        </div>
        <div className="stat-card card info">
          <div className="stat-value">{summary.total_labels || 0}</div>
          <div className="stat-label">Etiquetas</div>
        </div>
        <div className="stat-card card warning">
          <div className="stat-value">{summary.total_reprints || 0}</div>
          <div className="stat-label">Reimpresiones</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) 1fr", gap: "16px", alignItems: "start" }}>
        <div className="card">
          <h3 style={{ marginBottom: "12px", fontSize: "15px", fontWeight: 700 }}>Ultimos jobs</h3>
          {!jobs.length && <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Sin jobs registrados.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "65vh", overflow: "auto" }}>
            {jobs.map((job) => {
              const active = selectedJobId === job.job_id;
              return (
                <button
                  key={job.job_id}
                  onClick={() => setSelectedJobId(job.job_id)}
                  style={{
                    textAlign: "left",
                    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                    background: active ? "var(--accent-soft)" : "var(--surface)",
                    borderRadius: "var(--radius)",
                    padding: "10px",
                    cursor: "pointer",
                    color: "var(--text-primary)",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{job.job_id}</div>
                  <div style={{ marginTop: "4px", fontSize: "13px", fontWeight: 700 }}>
                    {job.labels_total} etiquetas · {job.reprints_total} reprints
                  </div>
                  <div style={{ marginTop: "4px", fontSize: "12px", color: "var(--text-secondary)" }}>
                    {formatDate(job.received_at)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: "12px", fontSize: "15px", fontWeight: 700 }}>Detalle</h3>
          {!selectedJobId && <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Selecciona un job.</p>}
          {loadingDetail && <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Cargando detalle...</p>}
          {!loadingDetail && detail?.job && (
            <>
              <div style={{ marginBottom: "12px", fontSize: "13px", color: "var(--text-secondary)" }}>
                <strong>Job:</strong> {detail.job.job_id}
                <br />
                <strong>Recibido:</strong> {formatDate(detail.job.received_at)}
                <br />
                <strong>Cliente:</strong> {formatDate(detail.job.created_at_client)}
                <br />
                <strong>Impresora:</strong> {detail.job.printer_path || "-"}
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>SKU</th>
                      <th>Tracking</th>
                      <th>Metodo</th>
                      <th>Reprint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.items || []).map((item) => (
                      <tr key={`${detail.job.job_id}-${item.item_order}-${item.tracking_number || "na"}`}>
                        <td>{item.item_order}</td>
                        <td>{item.sku || "SIN-SKU"}</td>
                        <td>{item.tracking_number || "-"}</td>
                        <td>{item.shipping_method || "-"}</td>
                        <td>
                          {item.is_reprint ? (
                            <span className="badge" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>Si</span>
                          ) : (
                            <span className="badge" style={{ background: "var(--success-bg)", color: "var(--success)" }}>No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
