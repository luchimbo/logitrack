"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

function SummaryBlock({ title, shipments, emptyLabel, downloadLabel }) {
  const groupedProducts = useMemo(() => groupProducts(shipments), [shipments]);
  const totalPackages = shipments.reduce((sum, shipment) => sum + (Number(shipment.total_packages || 0) || 1), 0);

  return (
    <div className="card">
      <div className="flex-between mb-md">
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700 }}>{title}</h3>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{shipments.length} envíos</span>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={downloadLabel}
          disabled={!shipments.length}
        >
          Etiquetas PDF
        </button>
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

      {shipments.length > 0 && (
        <div style={{ display: 'grid', gap: '10px', marginTop: '16px' }}>
          {shipments.map((shipment) => (
            <div key={shipment.id} className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
              <div className="mobile-card-title">Envio {shipment.external_id || shipment.id}</div>
              <div className="mobile-card-body" style={{ marginTop: '8px' }}>
                <div className="mobile-card-row"><span className="mobile-card-label">Estado Zipnova</span><span className="mobile-card-value">{shipment.status_name || shipment.status || '-'}</span></div>
                <div className="mobile-card-row"><span className="mobile-card-label">Paquetes</span><span className="mobile-card-value">{shipment.total_packages || 0}</span></div>
                <div className="mobile-card-row"><span className="mobile-card-label">Productos</span><span className="mobile-card-value">{shipment.products?.map((product) => product.name).filter(Boolean).join(', ') || '-'}</span></div>
                {shipment.downloaded_at ? (
                  <div className="mobile-card-row"><span className="mobile-card-label">Marcado listo</span><span className="mobile-card-value">{new Date(shipment.downloaded_at).toLocaleString('es-AR')}</span></div>
                ) : null}
                {shipment.downloaded_by ? (
                  <div className="mobile-card-row"><span className="mobile-card-label">Por</span><span className="mobile-card-value">{shipment.downloaded_by}</span></div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ZipnovaSection() {
  const [pendingShipments, setPendingShipments] = useState([]);
  const [readyShipments, setReadyShipments] = useState([]);
  const [totalShipments, setTotalShipments] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [downloadingGroup, setDownloadingGroup] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const load = useCallback(async ({ sync = true } = {}) => {
    if (sync) {
      setSyncing(true);
    } else {
      setLoading(true);
    }
    setError('');
    setWarning('');
    try {
      const params = new URLSearchParams();
      if (search) params.set('external_id', search);
      if (!sync) params.set('sync', '0');
      const res = await fetch(`/api/admin/zipnova?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar Zipnova');
      setTotalShipments(data.totalShipments || 0);
      setLastSyncedAt(data.lastSyncedAt || '');
      setPendingShipments(data.pendingShipments || []);
      setReadyShipments(data.readyShipments || []);
      setWarning(data.warning || '');
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const downloadLabels = async (group, shipments) => {
    setDownloadingGroup(group);
    setError('');
    try {
      const shipmentIds = shipments.map((shipment) => shipment.id).filter(Boolean);
      const res = await fetch('/api/admin/zipnova/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipmentIds, group }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudieron descargar las etiquetas');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `etiquetas-${group}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      await load({ sync: false });
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setDownloadingGroup('');
    }
  };

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Zipnova</h2>
        <p className="section-subtitle">Vista de super admin para Zipnova. Los grupos dependen de si la etiqueta fue descargada desde GeoModi, no del estado informado por Zipnova.</p>
      </div>

      {error ? <div className="card" style={{ marginBottom: '12px', background: 'var(--danger-bg)', color: 'var(--danger)' }}>{error}</div> : null}
      {warning ? <div className="card" style={{ marginBottom: '12px', background: 'var(--warning-bg, #fff7ed)', color: 'var(--warning, #c2410c)' }}>{warning}</div> : null}

      <div className="card" style={{ marginBottom: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
        Ultima sincronizacion: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString('es-AR') : 'sin datos todavia'}
      </div>

      <div className="stats-grid" style={{ marginBottom: '18px' }}>
        <div className="stat-card card accent"><div className="stat-value">{totalShipments}</div><div className="stat-label">Zipnova hoy</div></div>
        <div className="stat-card card info"><div className="stat-value">{pendingShipments.length}</div><div className="stat-label">Pendientes</div></div>
        <div className="stat-card card success"><div className="stat-value">{readyShipments.length}</div><div className="stat-label">Listos</div></div>
      </div>

      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Buscar por External ID</label>
            <input className="form-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar envío Zipnova de hoy" />
          </div>
          <div className="form-group" style={{ maxWidth: '180px' }}>
            <button type="button" className="btn btn-primary" onClick={load} disabled={loading}>
              {loading && !syncing ? 'Cargando...' : 'Buscar'}
            </button>
          </div>
          <div className="form-group" style={{ maxWidth: '220px' }}>
            <button type="button" className="btn btn-ghost" onClick={() => load({ sync: true })} disabled={syncing}>
              {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        <SummaryBlock
          title="Pendientes"
          shipments={pendingShipments}
          emptyLabel="No hay envíos nuevos pendientes."
          downloadLabel={() => downloadLabels('pendientes', pendingShipments)}
        />
        <SummaryBlock
          title="Listos para despachar"
          shipments={readyShipments}
          emptyLabel="No hay envíos listos para despacho."
          downloadLabel={() => downloadLabels('listos-para-despachar', readyShipments)}
        />
      </div>

      {downloadingGroup && (
        <div className="card" style={{ marginTop: '18px' }}>
          Descargando etiquetas del grupo: <strong>{downloadingGroup}</strong>
        </div>
      )}
    </section>
  );
}
