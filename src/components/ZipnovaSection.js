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

function isLabelLikelyAvailable(shipment) {
  const status = String(shipment.status || '').toLowerCase();
  return status === 'documentation_ready' || status === 'ready_to_ship';
}

function ShipmentCard({ shipment, onDownload }) {
  const likelyAvailable = isLabelLikelyAvailable(shipment);
  return (
    <div key={shipment.id} className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
      <div className="mobile-card-title">Envio {shipment.external_id || shipment.id}</div>
      <div className="mobile-card-body" style={{ marginTop: '8px' }}>
        <div className="mobile-card-row">
          <span className="mobile-card-label">Estado Zipnova</span>
          <span className="mobile-card-value">{shipment.status_name || shipment.status || '-'}</span>
        </div>
        <div className="mobile-card-row">
          <span className="mobile-card-label">Etiqueta</span>
          <span className="mobile-card-value" style={{ color: likelyAvailable ? 'var(--success, #16a34a)' : 'var(--warning, #c2410c)' }}>
            {likelyAvailable ? 'Disponible' : 'No disponible todavia'}
          </span>
        </div>
        <div className="mobile-card-row"><span className="mobile-card-label">Paquetes</span><span className="mobile-card-value">{shipment.total_packages || 0}</span></div>
        <div className="mobile-card-row"><span className="mobile-card-label">Productos</span><span className="mobile-card-value">{shipment.products?.map((product) => product.name).filter(Boolean).join(', ') || '-'}</span></div>
        {shipment.downloaded_at ? (
          <div className="mobile-card-row"><span className="mobile-card-label">Marcado listo</span><span className="mobile-card-value">{new Date(shipment.downloaded_at).toLocaleString('es-AR')}</span></div>
        ) : null}
        {shipment.downloaded_by ? (
          <div className="mobile-card-row"><span className="mobile-card-label">Por</span><span className="mobile-card-value">{shipment.downloaded_by}</span></div>
        ) : null}
        <div className="mobile-card-row" style={{ marginTop: '8px' }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => onDownload(shipment)}
            disabled={!likelyAvailable}
            title={likelyAvailable ? 'Descargar etiqueta de este envio' : 'Etiqueta no disponible todavia'}
          >
            Descargar etiqueta
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryBlock({ title, shipments, emptyLabel, downloadLabel }) {
  const groupedProducts = useMemo(() => groupProducts(shipments), [shipments]);
  const totalPackages = shipments.reduce((sum, shipment) => sum + (Number(shipment.total_packages || 0) || 1), 0);
  const availableCount = shipments.filter(isLabelLikelyAvailable).length;

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

      {shipments.length > 0 && (
        <div style={{ marginBottom: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
          {availableCount} de {shipments.length} envíos con etiqueta disponible en Zipnova
        </div>
      )}

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
            <ShipmentCard key={shipment.id} shipment={shipment} onDownload={(s) => downloadLabel(s)} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ZipnovaSection({ currentUser }) {
  const canManageIntegration = currentUser?.isGlobalAdmin || ['owner', 'admin'].includes(currentUser?.role);
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

  const [connected, setConnected] = useState(false);
  const [connectedAt, setConnectedAt] = useState('');
  const [connecting, setConnecting] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/zipnova/status');
      const data = await res.json();
      if (res.ok) {
        setConnected(Boolean(data.connected));
        setConnectedAt(data.connectedAt || '');
      }
    } catch (err) {
      console.error('Zipnova status error', err);
    }
  }, []);

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
    const params = new URLSearchParams(window.location.search);
    if (params.get('zipnova_connected') === '1') {
      setError('');
      setWarning('Integración con Zipnova conectada correctamente.');
      window.history.replaceState({}, '', window.location.pathname + '?tab=zipnova');
      loadStatus();
    }
    const zipnovaError = params.get('zipnova_error');
    if (zipnovaError) {
      setError(decodeURIComponent(zipnovaError));
      window.history.replaceState({}, '', window.location.pathname + '?tab=zipnova');
    }
  }, [loadStatus]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (connected) {
      load();
    }
  }, [connected, load]);

  const handleConnect = async () => {
    setConnecting(true);
    setError('');
    try {
      const res = await fetch('/api/admin/zipnova/connect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar la conexión');
      if (data.authorizeUrl) {
        window.location.href = data.authorizeUrl;
      } else {
        throw new Error('No se recibió la URL de autorización');
      }
    } catch (err) {
      setError(err.message || 'Error inesperado');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('¿Seguro que quieres desconectar la integración con Zipnova?')) return;
    setConnecting(true);
    setError('');
    try {
      const res = await fetch('/api/admin/zipnova/connect', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo desconectar');
      await loadStatus();
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setConnecting(false);
    }
  };

  const downloadLabels = async (groupOrShipment, shipmentsOrSingle) => {
    const isSingleShipment = !shipmentsOrSingle && typeof groupOrShipment === 'object';
    const group = isSingleShipment ? `envio-${groupOrShipment.external_id || groupOrShipment.id}` : groupOrShipment;
    const shipments = isSingleShipment ? [groupOrShipment] : shipmentsOrSingle;

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
      const downloadedCount = Number(res.headers.get('X-Zipnova-Downloaded') || '0');
      const skippedCount = Number(res.headers.get('X-Zipnova-Skipped') || '0');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `etiquetas-${group}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      if (skippedCount > 0) {
        setWarning(`Se descargaron ${downloadedCount} etiquetas y ${skippedCount} envios siguen sin etiqueta disponible en Zipnova.`);
      }
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
        <p className="section-subtitle">Integración con Zipnova. Los grupos dependen de si la etiqueta fue descargada desde GeoModi, no del estado informado por Zipnova.</p>
      </div>

      {error ? <div className="card" style={{ marginBottom: '12px', background: 'var(--danger-bg)', color: 'var(--danger)' }}>{error}</div> : null}
      {warning ? <div className="card" style={{ marginBottom: '12px', background: 'var(--warning-bg, #fff7ed)', color: 'var(--warning, #c2410c)' }}>{warning}</div> : null}

      {!connected ? (
        <div className="card" style={{ maxWidth: '520px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Conectar con Zipnova</h3>
          {canManageIntegration ? (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
                Iniciá sesión con tu cuenta de Zipnova para autorizar a GeoModi a acceder a tus envíos.
              </p>
              <button type="button" className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
                {connecting ? 'Redirigiendo...' : 'Iniciar sesión con Zipnova'}
              </button>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              Zipnova no está configurado para este workspace. Contactá a un administrador para conectar la integración.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: '12px' }}>
            <div className="flex-between" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                Integración activa {connectedAt ? `· Conectado el ${new Date(connectedAt).toLocaleString('es-AR')}` : ''}
              </div>
              {canManageIntegration ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleDisconnect} disabled={connecting}>
                  {connecting ? 'Procesando...' : 'Desconectar / Cambiar credenciales'}
                </button>
              ) : null}
            </div>
          </div>

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
        </>
      )}
    </section>
  );
}
