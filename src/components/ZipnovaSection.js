"use client";

import { useEffect, useMemo, useState } from "react";

export default function ZipnovaSection() {
  const [shipments, setShipments] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
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

  const groupedProducts = useMemo(() => {
    const grouped = new Map();

    for (const shipment of shipments) {
      const products = Array.isArray(shipment.products) ? shipment.products : [];
      for (const product of products) {
        const key = `${product.sku || ''}::${product.name || 'Sin producto'}`;
        const current = grouped.get(key) || {
          key,
          name: product.name || 'Sin producto',
          sku: product.sku || '-',
          shipmentCount: 0,
          packages: 0,
        };

        current.shipmentCount += 1;
        current.packages += Number(shipment.total_packages || 0) || 1;
        grouped.set(key, current);
      }
    }

    return [...grouped.values()].sort((a, b) => b.packages - a.packages || a.name.localeCompare(b.name));
  }, [shipments]);

  const totalPackages = shipments.reduce((sum, shipment) => sum + (Number(shipment.total_packages || 0) || 1), 0);

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Zipnova</h2>
        <p className="section-subtitle">Productos pendientes listos para despachar y cantidad total de paquetes. Visible únicamente para el admin maestro.</p>
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

      <div className="stats-grid">
        <div className="stat-card card accent"><div className="stat-value">{shipments.length}</div><div className="stat-label">Envíos pendientes</div></div>
        <div className="stat-card card info"><div className="stat-value">{totalPackages}</div><div className="stat-label">Paquetes</div></div>
        <div className="stat-card card success"><div className="stat-value">{groupedProducts.length}</div><div className="stat-label">Productos</div></div>
      </div>

      <div className="card">
        <div className="flex-between mb-md">
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Productos pendientes listos para despacho</h3>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Página {meta?.current_page || page} de {meta?.last_page || page}</span>
        </div>
        <div style={{ display: 'grid', gap: '10px' }}>
          {groupedProducts.map((product) => (
            <div key={product.key} className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
              <div className="mobile-card-title">{product.name}</div>
              <div className="mobile-card-body" style={{ marginTop: '8px' }}>
                <div className="mobile-card-row"><span className="mobile-card-label">SKU / Ref</span><span className="mobile-card-value">{product.sku}</span></div>
                <div className="mobile-card-row"><span className="mobile-card-label">Envíos pendientes</span><span className="mobile-card-value">{product.shipmentCount}</span></div>
                <div className="mobile-card-row"><span className="mobile-card-label">Cantidad de paquetes</span><span className="mobile-card-value">{product.packages}</span></div>
              </div>
            </div>
          ))}
          {!loading && groupedProducts.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No hay productos pendientes para los filtros elegidos.</p>}
        </div>
        <div className="flex-between mt-md">
          <button className="btn btn-ghost btn-sm" disabled={!meta?.current_page || meta.current_page <= 1} onClick={() => load(page - 1)}>Anterior</button>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Envíos pendientes en esta página: {shipments.length}</span>
          <button className="btn btn-ghost btn-sm" disabled={!meta?.last_page || page >= meta.last_page} onClick={() => load(page + 1)}>Siguiente</button>
        </div>
      </div>
    </section>
  );
}
