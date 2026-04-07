"use client";

import { useEffect, useState } from "react";

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-AR');
}

export default function ZipnovaSection() {
  const [shipments, setShipments] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async (nextPage = page) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(nextPage), status: 'new' });
      if (search) params.set('external_id', search);
      const res = await fetch(`/api/admin/zipnova?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar Zipnova');
      setShipments(data.shipments || []);
      setMeta(data.meta || null);
      setPage(nextPage);
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  const loadDetail = async (id) => {
    setSelectedId(String(id));
    setDetailLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/zipnova/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el detalle');
      setSelectedDetail(data.shipment);
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Zipnova</h2>
        <p className="section-subtitle">Solo envíos pendientes y su producto asociado. Visible únicamente para el admin maestro.</p>
      </div>

      {error ? <div className="card" style={{ marginBottom: '12px', background: 'var(--danger-bg)', color: 'var(--danger)' }}>{error}</div> : null}

      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Buscar por External ID</label>
            <input className="form-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar envío pendiente" />
          </div>
          <div className="form-group" style={{ maxWidth: '180px' }}>
            <button type="button" className="btn btn-primary" onClick={() => load(1)} disabled={loading}>
              {loading ? 'Cargando...' : 'Buscar'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 460px) minmax(0, 1fr)', gap: '20px', alignItems: 'start' }}>
        <div className="card">
          <div className="flex-between mb-md">
            <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Pendientes Zipnova</h3>
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Página: {shipments.length}</span>
          </div>
          <div style={{ display: 'grid', gap: '10px', maxHeight: '70vh', overflowY: 'auto', paddingRight: '4px' }}>
            {shipments.map((shipment) => {
              const productLabel = shipment.products?.map((p) => p.name).filter(Boolean).join(' · ') || 'Sin producto';
              return (
                <button
                  key={shipment.id}
                  type="button"
                  className="mobile-card"
                  onClick={() => loadDetail(shipment.id)}
                  style={{
                    display: 'block',
                    marginBottom: 0,
                    textAlign: 'left',
                    background: selectedId === String(shipment.id) ? 'var(--accent-light)' : undefined,
                    borderColor: selectedId === String(shipment.id) ? 'var(--accent)' : undefined,
                  }}
                >
                  <div className="mobile-card-title">{shipment.external_id || shipment.delivery_id || `Envío #${shipment.id}`}</div>
                  <div className="mobile-card-body" style={{ marginTop: '8px' }}>
                    <div className="mobile-card-row"><span className="mobile-card-label">Producto</span><span className="mobile-card-value">{productLabel}</span></div>
                    <div className="mobile-card-row"><span className="mobile-card-label">Destinatario</span><span className="mobile-card-value">{shipment.recipient_name || '-'}</span></div>
                    <div className="mobile-card-row"><span className="mobile-card-label">Estado</span><span className="mobile-card-value">{shipment.status_name || shipment.status}</span></div>
                  </div>
                </button>
              );
            })}
            {!loading && shipments.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No hay envíos pendientes para los filtros elegidos.</p>}
          </div>
          <div className="flex-between mt-md">
            <button className="btn btn-ghost btn-sm" disabled={!meta?.current_page || meta.current_page <= 1} onClick={() => load(page - 1)}>Anterior</button>
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Página {meta?.current_page || page} de {meta?.last_page || page}</span>
            <button className="btn btn-ghost btn-sm" disabled={!meta?.last_page || page >= meta.last_page} onClick={() => load(page + 1)}>Siguiente</button>
          </div>
        </div>

        <div className="card">
          <div className="flex-between mb-md">
            <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Detalle del pendiente</h3>
            {selectedDetail ? <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>#{selectedDetail.id}</span> : null}
          </div>
          {detailLoading ? (
            <div className="spinner"></div>
          ) : selectedDetail ? (
            <div style={{ display: 'grid', gap: '16px' }}>
              <div className="stats-grid">
                <div className="stat-card card accent"><div className="stat-value">{selectedDetail.total_packages || 0}</div><div className="stat-label">Paquetes</div></div>
                <div className="stat-card card info"><div className="stat-value">{selectedDetail.total_weight || 0}</div><div className="stat-label">Peso</div></div>
                <div className="stat-card card success"><div className="stat-value">{selectedDetail.price || 0}</div><div className="stat-label">Precio</div></div>
              </div>

              <div className="card">
                <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Producto</h4>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {(selectedDetail.products || []).map((product, index) => (
                    <div key={`${product.sku || product.name}-${index}`} className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
                      <div className="mobile-card-title">{product.name}</div>
                      <div className="mobile-card-body" style={{ marginTop: '8px' }}>
                        <div className="mobile-card-row"><span className="mobile-card-label">SKU / Ref</span><span className="mobile-card-value">{product.sku || '-'}</span></div>
                        {product.extra ? <div className="mobile-card-row"><span className="mobile-card-label">Extra</span><span className="mobile-card-value">{product.extra}</span></div> : null}
                        <div className="mobile-card-row"><span className="mobile-card-label">Peso</span><span className="mobile-card-value">{product.weight || 0}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                <div className="card">
                  <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Destino</h4>
                  <div className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
                    <div className="mobile-card-row"><span className="mobile-card-label">Destinatario</span><span className="mobile-card-value">{selectedDetail.recipient_name || '-'}</span></div>
                    <div className="mobile-card-row"><span className="mobile-card-label">Dirección</span><span className="mobile-card-value">{selectedDetail.address || '-'}</span></div>
                    <div className="mobile-card-row"><span className="mobile-card-label">Ciudad</span><span className="mobile-card-value">{selectedDetail.city || '-'}</span></div>
                    <div className="mobile-card-row"><span className="mobile-card-label">Provincia</span><span className="mobile-card-value">{selectedDetail.province || '-'}</span></div>
                    <div className="mobile-card-row"><span className="mobile-card-label">CP</span><span className="mobile-card-value">{selectedDetail.postal_code || '-'}</span></div>
                  </div>
                </div>

                <div className="card">
                  <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Estado y servicio</h4>
                  <div className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
                    <div className="mobile-card-row"><span className="mobile-card-label">Estado</span><span className="mobile-card-value">{selectedDetail.status_name || selectedDetail.status}</span></div>
                    <div className="mobile-card-row"><span className="mobile-card-label">Logística</span><span className="mobile-card-value">{selectedDetail.logistic_type || '-'}</span></div>
                    <div className="mobile-card-row"><span className="mobile-card-label">Servicio</span><span className="mobile-card-value">{selectedDetail.service_type || '-'}</span></div>
                    <div className="mobile-card-row"><span className="mobile-card-label">Carrier</span><span className="mobile-card-value">{selectedDetail.carrier_name || '-'}</span></div>
                    <div className="mobile-card-row"><span className="mobile-card-label">Creado</span><span className="mobile-card-value">{formatDate(selectedDetail.created_at)}</span></div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '30px 12px' }}>
              <div className="empty-state-icon">📮</div>
              <p className="empty-state-text">Elegí un envío pendiente para ver qué producto contiene.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
