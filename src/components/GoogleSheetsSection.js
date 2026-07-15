"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { api, toast } from "@/lib/api";
import LoadingButton from "./LoadingButton";

export default function GoogleSheetsSection({ currentUser, onBadgeUpdate }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [packedLoadingId, setPackedLoadingId] = useState(null);
  const [error, setError] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const lastPendingCount = useRef(null); // track previous count to detect new arrivals

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending"); // pending (default), packed, history
  const [methodFilter, setMethodFilter] = useState("all");

  const fetchData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await api(`/shipments/sheet?status=${statusFilter}&q=${encodeURIComponent(searchQuery)}&method=${encodeURIComponent(methodFilter)}`);
      if (data.ok) {
        setShipments(data.shipments);
        if (onBadgeUpdate) {
          onBadgeUpdate('sheetSync', data.pendingCount);
        }
        // Notify if new shipments arrived since last check
        if (lastPendingCount.current !== null && data.pendingCount > lastPendingCount.current) {
          const newCount = data.pendingCount - lastPendingCount.current;
          toast(`🚀 ${newCount} nuevo${newCount > 1 ? 's' : ''} envío${newCount > 1 ? 's' : ''} en la planilla`, 'info');
        }
        lastPendingCount.current = data.pendingCount;
      } else {
        throw new Error(data.error || "No se pudieron obtener los datos");
      }
    } catch (err) {
      if (!silent) {
        setError(err.message);
        toast(err.message, "error");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [statusFilter, searchQuery, methodFilter, onBadgeUpdate]);

  // Fetch on filter changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-sync from Google Sheets every 2 minutes (while on this tab)
  useEffect(() => {
    const autoSync = async () => {
      try {
        await api('/cron/sheets-sync');
        await fetchData({ silent: true });
        setLastSynced(new Date().toLocaleTimeString());
      } catch (e) { /* silent */ }
    };

    const interval = setInterval(autoSync, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Handle manual search form submit
  const handleSearch = (e) => {
    e.preventDefault();
    fetchData();
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const data = await api('/cron/sheets-sync');
      if (data.ok) {
        toast(`Sincronizado: ${data.newShipments} nuevos, ${data.updatedShipments} actualizados`, "success");
        setLastSynced(new Date().toLocaleTimeString());
        await fetchData();
      } else {
        throw new Error(data.error || "Error de sincronización");
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSyncing(false);
    }
  };

  const handleMarkDispatched = async (id) => {
    setActionLoadingId(id);
    try {
      const data = await api(`/shipments/sheet/dispatched`, {
        method: 'POST',
        body: JSON.stringify({ id })
      });
      if (data.ok) {
        toast("Marcado como despachado", "success");
        // The server already confirmed the change, so update only this row
        // instead of making the full table flash while it downloads again.
        setShipments((previous) => {
          const updated = previous.map((shipment) => (
            shipment.id === id ? { ...shipment, dispatched: 1 } : shipment
          ));
          return statusFilter === "history"
            ? updated
            : updated.filter((shipment) => shipment.id !== id);
        });
        if (lastPendingCount.current !== null) {
          lastPendingCount.current = Math.max(0, lastPendingCount.current - 1);
          onBadgeUpdate?.('sheetSync', lastPendingCount.current);
        }
      } else {
        throw new Error(data.error || "Error al despachar");
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleTogglePacked = async (id, currentPacked) => {
    setPackedLoadingId(id);
    try {
      const newPacked = !currentPacked;
      const data = await api(`/shipments/sheet/packed`, {
        method: 'POST',
        body: JSON.stringify({ id, packed: newPacked })
      });
      if (data.ok) {
        toast(newPacked ? "Envío empaquetado" : "Empaquetado cancelado", "success");
        // Packing changes just one record; keep the rest of the list in place.
        setShipments((previous) => previous
          .map((shipment) => (
            shipment.id === id ? { ...shipment, packed: newPacked ? 1 : 0 } : shipment
          ))
          .filter((shipment) => statusFilter !== "packed" || shipment.packed)
        );
      } else {
        throw new Error(data.error || "Error al actualizar");
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setPackedLoadingId(null);
    }
  };

  // Get available shipping methods from data
  const availableMethods = useMemo(() => {
    // Collect from current state or hardcode the known list
    const methods = new Set(["Flex Dani", "Expreso", "Flex Entregoya"]);
    shipments.forEach(s => {
      if (s.shipping_method) methods.add(s.shipping_method);
    });
    return Array.from(methods).filter(Boolean);
  }, [shipments]);

  // Statistics calculation (always from current visible list)
  const stats = useMemo(() => {
    let pending = 0;
    let packed = 0;
    
    shipments.forEach(s => {
      if (!s.dispatched) {
        pending++;
        if (s.packed) packed++;
      }
    });

    return { total: shipments.length, pending, packed };
  }, [shipments]);

  return (
    <div className="section active">
      <div className="section-header flex-between" style={{ gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 className="section-title">📊 Envíos Planilla</h1>
          <p className="section-subtitle">Sincronización con planilla Google Sheets (Respuestas del Formulario)</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {lastSynced && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Última sync: {lastSynced}
            </span>
          )}
          <LoadingButton
            isLoading={syncing}
            className="btn btn-primary"
            onClick={handleSync}
            style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
          >
            🔄 Sincronizar Planilla
          </LoadingButton>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="stats-grid" style={{ marginBottom: '20px' }}>
        <div className="stat-card card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div className="stat-value" style={{ color: '#f59e0b' }}>{stats.pending}</div>
          <div className="stat-label">Pendientes de Despacho</div>
        </div>
        <div className="stat-card card" style={{ borderLeft: '4px solid #0ea5e9' }}>
          <div className="stat-value" style={{ color: '#0ea5e9' }}>{stats.packed}</div>
          <div className="stat-label">Empaquetados (listos)</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card" style={{ marginBottom: '16px', padding: '16px' }}>
        <form onSubmit={handleSearch} className="filters-bar" style={{ display: 'flex', gap: '12px', alignItems: 'center', width: '100%', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Buscar por cliente, producto, orden, notas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', paddingRight: '40px' }}
            />
            <button type="submit" className="btn btn-ghost" style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', padding: '4px 8px' }}>
              🔍
            </button>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select
              className="form-control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ minWidth: '140px' }}
            >
              <option value="pending">Pendientes de Despacho</option>
              <option value="packed">Solo Empaquetados</option>
              <option value="history">Historial completo</option>
            </select>

            <select
              className="form-control"
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              style={{ minWidth: '160px' }}
            >
              <option value="all">Todos los Métodos</option>
              {availableMethods.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            <button type="button" className="btn btn-ghost" onClick={() => { setSearchQuery(""); setStatusFilter("all"); setMethodFilter("all"); fetchData(); }}>
              Limpiar
            </button>
          </div>
        </form>
      </div>

      {/* Content Area */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div className="spinner"></div>
        </div>
      ) : error ? (
        <div className="card" style={{ padding: '24px', textAlign: 'center', border: '1px solid var(--danger-border)' }}>
          <p style={{ color: 'var(--danger)', fontWeight: 600 }}>Error al cargar envíos</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>{error}</p>
        </div>
      ) : shipments.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <p className="empty-state-text">No hay envíos pendientes de despacho. ¡Todo al día!</p>
          <button className="btn btn-ghost" style={{ marginTop: '12px' }} onClick={() => setStatusFilter('history')}>Ver historial completo</button>
        </div>
      ) : (
        <div>
          {/* Desktop Table View */}
          <div className="table-container desktop-only">
            <table className="table">
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Orden</th>
                  <th>Producto</th>
                  <th>Dirección / Localidad</th>
                  <th>Método</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map(s => (
                  <tr key={s.id} className={s.dispatched ? "opacity-50" : ""}>
                    <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>#{s.row_index}</td>
                    <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>{s.timestamp?.split(' ')[0]}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{s.client_name}</div>
                      {s.phone && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>📞 {s.phone}</div>}
                    </td>
                    <td><span className="badge badge-secondary">{s.order_id || 'N/A'}</span></td>
                    <td style={{ maxWidth: '200px', wordBreak: 'break-word' }}>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>{s.product_name}</div>
                      {s.notes && <div style={{ fontSize: '11px', color: 'var(--warning)', marginTop: '2px' }}>⚠️ {s.notes}</div>}
                    </td>
                    <td>
                      <div style={{ fontSize: '13px' }}>{s.address} {s.floor_depto}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.city}, {s.province} {s.postal_code ? `(${s.postal_code})` : ''}</div>
                    </td>
                    <td>
                      <span className="topbar-chip font-semibold" style={{
                        background: s.shipping_method?.toLowerCase().includes('flex') ? 'rgba(59, 130, 246, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                        color: s.shipping_method?.toLowerCase().includes('flex') ? 'rgb(59, 130, 246)' : 'inherit',
                        fontSize: '11px'
                      }}>
                        {s.shipping_method}
                      </span>
                    </td>
                    <td>
                      {s.dispatched ? (
                        <span className="badge badge-success">✓ Despachado</span>
                      ) : s.packed ? (
                        <span className="badge badge-info">📦 Empaquetado</span>
                      ) : (
                        <span className="badge badge-warning">⏳ Pendiente</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        {!s.dispatched && (
                          <>
                            <LoadingButton
                              isLoading={packedLoadingId === s.id}
                              onClick={() => handleTogglePacked(s.id, s.packed)}
                              className="btn btn-sm btn-secondary"
                              style={{ padding: '6px 10px', display: 'flex', alignItems: 'center' }}
                              title={s.packed ? "Marcar como pendiente" : "Marcar como listo / empaquetado"}
                            >
                              {s.packed ? "↩ Deshacer Pack" : "📦 Empaquetar"}
                            </LoadingButton>
                            
                            <LoadingButton
                              isLoading={actionLoadingId === s.id}
                              onClick={() => handleMarkDispatched(s.id)}
                              className="btn btn-sm btn-primary"
                              style={{ padding: '6px 12px', background: '#10b981', borderColor: '#10b981', color: '#fff' }}
                            >
                              🚀 Despachar
                            </LoadingButton>
                          </>
                        )}
                        {s.dispatched && (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Listo</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="mobile-cards-container">
            {shipments.map(s => (
              <div key={s.id} className={`mobile-card ${s.dispatched ? "opacity-60" : ""}`} style={{ borderLeft: s.dispatched ? '3px solid #10b981' : s.packed ? '3px solid #0ea5e9' : '3px solid #f59e0b' }}>
                <div className="mobile-card-header">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Fila #{s.row_index} • {s.timestamp?.split(' ')[0]}</span>
                      {s.dispatched ? (
                        <span className="badge badge-success">Despachado</span>
                      ) : s.packed ? (
                        <span className="badge badge-info">Empaquetado</span>
                      ) : (
                        <span className="badge badge-warning">Pendiente</span>
                      )}
                    </div>
                    <div className="mobile-card-title">{s.client_name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{s.product_name}</div>
                  </div>
                </div>
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Orden/Ref:</span>
                    <span className="mobile-card-value">{s.order_id || 'N/A'}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Dirección:</span>
                    <span className="mobile-card-value">{s.address} {s.floor_depto}, {s.city}</span>
                  </div>
                  {s.notes && (
                    <div className="mobile-card-row" style={{ color: 'var(--warning)' }}>
                      <span className="mobile-card-label">Notas:</span>
                      <span className="mobile-card-value">⚠️ {s.notes}</span>
                    </div>
                  )}
                </div>
                <div className="mobile-card-actions">
                  {!s.dispatched && (
                    <>
                      <LoadingButton
                        isLoading={packedLoadingId === s.id}
                        onClick={() => handleTogglePacked(s.id, s.packed)}
                        className="btn btn-sm btn-secondary"
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        {s.packed ? "↩ Pendiente" : "📦 Empacar"}
                      </LoadingButton>
                      
                      <LoadingButton
                        isLoading={actionLoadingId === s.id}
                        onClick={() => handleMarkDispatched(s.id)}
                        className="btn btn-sm btn-primary"
                        style={{ flex: 1, justifyContent: 'center', background: '#10b981', borderColor: '#10b981', color: '#fff' }}
                      >
                        🚀 Despachar
                      </LoadingButton>
                    </>
                  )}
                  {s.dispatched && (
                    <div style={{ width: '100%', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px' }}>
                      Envío procesado y despachado.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
