"use client";

import { useEffect, useMemo, useState } from "react";

function groupProducts(shipments) {
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
}

function SummaryBlock({ title, shipments, emptyLabel }) {
  const groupedProducts = useMemo(() => groupProducts(shipments), [shipments]);
  const totalPackages = shipments.reduce((sum, shipment) => sum + (Number(shipment.total_packages || 0) || 1), 0);

  return (
    <div className="card">
      <div className="flex-between mb-md">
        <h3 style={{ fontSize: '16px', fontWeight: 700 }}>{title}</h3>
        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{shipments.length} envíos</span>
      </div>

      <div className="stats-grid" style={{ marginBottom: '16px' }}>
        <div className="stat-card card accent"><div className="stat-value">{shipments.length}</div><div className="stat-label">Envíos</div></div>
        <div className="stat-card card info"><div className="stat-value">{totalPackages}</div><div className="stat-label">Paquetes</div></div>
        <div className="stat-card card success"><div className="stat-value">{groupedProducts.length}</div><div className="stat-label">Productos</div></div>
      </div>

      <div style={{ display: 'grid', gap: '10px' }}>
        {groupedProducts.map((product) => (
          <div key={product.key} className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
            <div className="mobile-card-title">{product.name}</div>
            <div className="mobile-card-body" style={{ marginTop: '8px' }}>
              <div className="mobile-card-row"><span className="mobile-card-label">SKU / Ref</span><span className="mobile-card-value">{product.sku}</span></div>
              <div className="mobile-card-row"><span className="mobile-card-label">Envíos</span><span className="mobile-card-value">{product.shipmentCount}</span></div>
              <div className="mobile-card-row"><span className="mobile-card-label">Paquetes</span><span className="mobile-card-value">{product.packages}</span></div>
            </div>
          </div>
        ))}
        {groupedProducts.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{emptyLabel}</p>}
      </div>
    </div>
  );
}

export default function ZipnovaSection() {
  const [pendingShipments, setPendingShipments] = useState([]);
  const [readyShipments, setReadyShipments] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.set('external_id', search);
      const res = await fetch(`/api/admin/zipnova?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar Zipnova');
      setPendingShipments(data.pendingShipments || []);
      setReadyShipments(data.readyShipments || []);
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Zipnova</h2>
        <p className="section-subtitle">Resumen por estado actual dividido entre envíos nuevos pendientes y envíos listos para despacho (ya con etiqueta/documentación).</p>
      </div>

      {error ? <div className="card" style={{ marginBottom: '12px', background: 'var(--danger-bg)', color: 'var(--danger)' }}>{error}</div> : null}

      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Buscar por External ID</label>
            <input className="form-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar envío de hoy" />
          </div>
          <div className="form-group" style={{ maxWidth: '180px' }}>
            <button type="button" className="btn btn-primary" onClick={load} disabled={loading}>
              {loading ? 'Cargando...' : 'Buscar'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        <SummaryBlock
          title="Pendientes"
          shipments={pendingShipments}
          emptyLabel="No hay envíos nuevos pendientes."
        />
        <SummaryBlock
          title="Listos para despachar"
          shipments={readyShipments}
          emptyLabel="No hay envíos listos para despacho."
        />
      </div>
    </section>
  );
}
