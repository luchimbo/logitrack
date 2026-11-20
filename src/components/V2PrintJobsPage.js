"use client";

import { useCallback, useEffect, useState } from "react";
import { api, toast } from "@/lib/api";
import { formatArgentinaDateTime } from "@/lib/dateUtils";
import SectionTitle from "./SectionTitle";

function formatDate(value) {
  if (!value) return "-";
  return formatArgentinaDateTime(value);
}

export default function V2PrintJobsPage() {
  const [loading, setLoading] = useState(true);
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
      setSelectedJobId((current) => current || data.jobs?.[0]?.job_id || null);
    } catch (err) {
      setError(err.message || "No se pudo cargar el historial de impresión.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (!selectedJobId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    async function loadDetail() {
      setLoadingDetail(true);
      try {
        const data = await api(`/v2/print-jobs/${encodeURIComponent(selectedJobId)}`);
        if (!cancelled) setDetail(data);
      } catch {
        if (!cancelled) {
          toast("No se pudo cargar el detalle de la impresión.", "error");
          setDetail(null);
        }
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    }

    loadDetail();
    return () => { cancelled = true; };
  }, [selectedJobId]);

  return (
    <div className="section active">
      <div className="section-header flex-between">
        <div>
          <SectionTitle icon="print">Historial de impresión</SectionTitle>
        </div>
        <button type="button" className="btn btn-ghost btn-sm print-jobs-refresh" onClick={loadJobs} disabled={loading}>
          {loading ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      {error && <p className="print-jobs-error" role="alert">{error}</p>}

      <div className="stats-grid">
        <div className="stat-card card accent">
          <div className="stat-value">{summary.total_jobs || 0}</div>
          <div className="stat-label">Trabajos de impresión</div>
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

      <div className="print-jobs-layout">
        <div className="card">
          <h2>Impresiones recientes</h2>
          {!jobs.length && !error && <p className="print-jobs-meta" role="status">{loading ? "Cargando impresiones…" : "Todavía no hay impresiones registradas."}</p>}
          <div className="print-jobs-list">
            {jobs.map((job) => {
              const active = selectedJobId === job.job_id;
              return (
                <button
                  key={job.job_id}
                  type="button"
                  className="print-job-item"
                  aria-pressed={active}
                  onClick={() => setSelectedJobId(job.job_id)}
                >
                  <strong>{job.labels_total} etiquetas · {job.reprints_total} reimpresiones</strong>
                  <span className="print-jobs-meta">{formatDate(job.received_at)}</span>
                  <span className="print-jobs-meta">{job.job_id}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h2>Detalle de impresión</h2>
          {!selectedJobId && <p className="print-jobs-meta">Seleccioná una impresión de la lista.</p>}
          {loadingDetail && <p className="print-jobs-meta" role="status">Cargando detalle…</p>}
          {!loadingDetail && detail?.job && detail.job.job_id === selectedJobId && (
            <>
              <div className="print-jobs-meta print-jobs-details">
                <strong>ID:</strong> {detail.job.job_id}
                <br />
                <strong>Recibido:</strong> {formatDate(detail.job.received_at)}
                <br />
                <strong>Cliente:</strong> {formatDate(detail.job.created_at_client)}
                <br />
                <strong>Impresora:</strong> {detail.job.printer_path || "-"}
                <br />
                <strong>Integridad:</strong> {detail.job.integrity?.verified ? `Verificada (${detail.job.integrity.input_blocks}/${detail.job.integrity.output_blocks})` : "No disponible"}
                {detail.job.integrity?.parser_misses ? <><br /><strong>Lecturas incompletas:</strong> {detail.job.integrity.parser_misses}</> : null}
              </div>

              <div className="table-container print-jobs-table" role="region" aria-label="Etiquetas de la impresión" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>SKU</th>
                      <th>Seguimiento</th>
                      <th>Método</th>
                      <th>Reimpresión</th>
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
                            <span className="badge" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>Sí</span>
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
