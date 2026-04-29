"use client";

import { useCallback, useEffect, useState } from "react";

function isLabelLikelyAvailable(shipment) {
  const status = String(shipment.status || '').toLowerCase();
  return status === 'documentation_ready' || status === 'ready_to_ship';
}

function formatCollectionDateParts(collection) {
  const dateLabel = collection?.scheduledDate
    ? new Date(`${collection.scheduledDate}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric', year: 'numeric' })
    : 'Fecha no informada';
  const open = collection?.windowOpen || '--';
  const close = collection?.windowClose || '--';
  return { dateLabel, timeLabel: open === '--' && close === '--' ? 'Horario no informado' : `de ${open} a ${close} hs` };
}

function formatOrigin(collection) {
  return [collection.originAddress, collection.originCity, collection.originProvince].filter(Boolean);
}

function formatVolume(value) {
  const n = Number(value || 0);
  if (!n) return '0 m3';
  const m3 = n > 10 ? n / 1000000 : n;
  return `${m3.toLocaleString('es-AR', { maximumFractionDigits: 2 })} m3`;
}

function CollectionDetail({ collection, onClose, onDownload }) {
  if (!collection) return null;
  const { dateLabel, timeLabel } = formatCollectionDateParts(collection);
  const shipments = collection.shipments || [];
  return (
    <div className="card" style={{ marginBottom: '18px', border: '1px solid var(--accent)' }}>
      <div className="flex-between mb-md" style={{ gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Detalle de recolección</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{collection.originName} · {dateLabel} {timeLabel}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onDownload(`recoleccion-${collection.collectionKey}`, shipments, 'pdf')}>
            PDF
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDownload(`recoleccion-${collection.collectionKey}`, shipments, 'zpl')}>
            ZPL
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cerrar</button>
        </div>
      </div>
      <div className="stats-grid" style={{ marginBottom: '14px' }}>
        <div className="stat-card card accent"><div className="stat-value">{collection.shipmentsCount}</div><div className="stat-label">Envíos</div></div>
        <div className="stat-card card info"><div className="stat-value">{collection.packagesCount}</div><div className="stat-label">Paquetes</div></div>
        <div className="stat-card card success"><div className="stat-value">{Math.round(Number(collection.totalWeight || 0) / 1000)}</div><div className="stat-label">Kg aprox.</div></div>
        <div className="stat-card card"><div className="stat-value">{formatVolume(collection.totalVolume)}</div><div className="stat-label">Volumen</div></div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr><th>Envío</th><th>Estado</th><th>Destinatario</th><th>Destino</th><th>Transporte</th><th>Paquetes</th></tr>
          </thead>
          <tbody>
            {shipments.map((shipment) => (
              <tr key={shipment.id}>
                <td><strong>{shipment.external_id || shipment.id}</strong><br /><span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{shipment.delivery_id || shipment.id}</span></td>
                <td>{shipment.status_name || shipment.status || '-'}</td>
                <td>{shipment.recipient_name || '-'}</td>
                <td>{[shipment.city, shipment.province].filter(Boolean).join(', ') || '-'}</td>
                <td>{shipment.carrier_name || '-'}</td>
                <td>{shipment.total_packages || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CollectionRow({ collection, kind, onDetail, onDownload }) {
  const { dateLabel, timeLabel } = formatCollectionDateParts(collection);
  const originLines = formatOrigin(collection);
  const isConfirmed = kind === 'confirmed';
  const preparationCount = (collection.shipments || []).filter((shipment) => ['new', 'documentation_ready'].includes(String(shipment.status || '').toLowerCase())).length;
  const readyCount = (collection.shipments || []).filter((shipment) => String(shipment.status || '').toLowerCase() === 'ready_to_ship').length;
  const availableShipments = (collection.shipments || []).filter(isLabelLikelyAvailable);
  const statusLabel = isConfirmed ? 'Confirmada' : 'No programada';
  const statusColor = isConfirmed ? 'var(--success)' : 'var(--warning)';
  const weightKg = Math.round(Number(collection.totalWeight || 0) / 1000);

  return (
    <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '16px', alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '999px', padding: '3px 9px', background: 'rgba(148,163,184,0.16)', color: statusColor, fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>{statusLabel}</span>
            <strong style={{ fontSize: '15px' }}>{collection.originName}</strong>
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{dateLabel} · {timeLabel}</span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5 }}>
            {originLines.join(' · ') || 'Dirección no informada'} · zipnova · {collection.shipmentsCount} envíos · {collection.packagesCount} paquetes · {weightKg} kg
            {preparationCount ? ` · ${preparationCount} pendientes de preparación` : ''}
            {readyCount ? ` · ${readyCount} listos` : ''}
          </div>
          <div style={{ color: availableShipments.length ? 'var(--text-muted)' : 'var(--warning)', fontSize: '12px', marginTop: '4px' }}>
            {availableShipments.length} de {collection.shipmentsCount} envíos con etiqueta disponible
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDetail(collection)}>Detalle</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!availableShipments.length} onClick={() => onDownload(`recoleccion-${collection.collectionKey}`, availableShipments, 'pdf')}>PDF</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!availableShipments.length} onClick={() => onDownload(`recoleccion-${collection.collectionKey}`, availableShipments, 'zpl')}>ZPL</button>
        </div>
      </div>
    </div>
  );
}

function CollectionsPanel({ title, children, warning }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '28px' }}>
      <div style={{ padding: '16px 20px', fontSize: '16px', fontWeight: 800 }}>{title} <span style={{ color: 'var(--accent)' }}>?</span></div>
      {warning ? <div style={{ background: 'var(--warning-bg, #fff7ed)', color: 'var(--warning, #c2410c)', padding: '14px 20px', fontSize: '14px' }}>{warning}</div> : null}
      {children}
    </div>
  );
}

export default function ZipnovaSection({ currentUser }) {
  const canManageIntegration = currentUser?.isGlobalAdmin || ['owner', 'admin'].includes(currentUser?.role);
  const [readyShipments, setReadyShipments] = useState([]);
  const [collectionShipments, setCollectionShipments] = useState([]);
  const [confirmedCollections, setConfirmedCollections] = useState([]);
  const [possibleCollections, setPossibleCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
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
  const [showManualForm, setShowManualForm] = useState(false);
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState('');

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
      setReadyShipments(data.readyShipments || []);
      setCollectionShipments(data.collectionShipments || []);
      setConfirmedCollections(data.confirmedCollections || []);
      setPossibleCollections(data.possibleCollections || []);
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
      if (!res.ok) {
        if (data.oauthConfigured === false) {
          setShowManualForm(true);
          setConnecting(false);
          return;
        }
        throw new Error(data.error || 'No se pudo iniciar la conexión');
      }
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

  const handleManualConnect = async (e) => {
    e.preventDefault();
    setConnecting(true);
    setError('');
    try {
      const res = await fetch('/api/admin/zipnova/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, secret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo conectar');
      setToken('');
      setSecret('');
      setShowManualForm(false);
      await loadStatus();
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
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

  const downloadLabels = async (groupOrShipment, shipmentsOrSingle, formatOverride = '') => {
    const isSingleShipment = !shipmentsOrSingle && typeof groupOrShipment === 'object';
    const group = isSingleShipment ? `envio-${groupOrShipment.external_id || groupOrShipment.id}` : groupOrShipment;
    const shipments = isSingleShipment ? [groupOrShipment] : shipmentsOrSingle;
    const requestedFormat = formatOverride || 'zpl';

    setDownloadingGroup(group);
    setError('');
    try {
      const shipmentIds = shipments.map((shipment) => shipment.id).filter(Boolean);
      const res = await fetch('/api/admin/zipnova/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipmentIds, group, format: requestedFormat }),
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
      a.download = `etiquetas-${group}.${requestedFormat}`;
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
              {!showManualForm ? (
                <>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
                    Iniciá sesión con tu cuenta de Zipnova para autorizar a GeoModi a acceder a tus envíos.
                  </p>
                  <button type="button" className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
                    {connecting ? 'Redirigiendo...' : 'Iniciar sesión con Zipnova'}
                  </button>
                  <div style={{ marginTop: '12px' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowManualForm(true)}
                      disabled={connecting}
                    >
                      O conectar manualmente con Token y Secret
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
                    Ingresá las credenciales de API de Zipnova para sincronizar envíos y descargar etiquetas.
                  </p>
                  <form onSubmit={handleManualConnect}>
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                      <label className="form-label">API Token</label>
                      <input
                        className="form-input"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="Token de Zipnova"
                        required
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <label className="form-label">API Secret</label>
                      <input
                        className="form-input"
                        type="password"
                        value={secret}
                        onChange={(e) => setSecret(e.target.value)}
                        placeholder="Secret de Zipnova"
                        required
                      />
                    </div>
                    <div className="flex-between" style={{ gap: '8px' }}>
                      <button type="submit" className="btn btn-primary" disabled={connecting || !token || !secret}>
                        {connecting ? 'Conectando...' : 'Conectar y guardar'}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowManualForm(false)}>
                        Volver
                      </button>
                    </div>
                  </form>
                </>
              )}
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

          <div className="card" style={{ marginBottom: '18px' }}>
            <div className="form-row" style={{ alignItems: 'end' }}>
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
              <div className="form-group" style={{ color: 'var(--text-muted)', fontSize: '12px', minWidth: '220px' }}>
                Última sincronización:<br />{lastSyncedAt ? new Date(lastSyncedAt).toLocaleString('es-AR') : 'sin datos todavía'}
              </div>
            </div>
          </div>

          <div className="flex-between" style={{ margin: '10px 0 18px', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 800 }}>Envíos pendientes de despacho</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                {totalShipments} envíos sincronizados · {collectionShipments.length} listos para recolectar · {readyShipments.length} con etiquetas descargadas
              </p>
            </div>
          </div>

          <CollectionsPanel title="Recolecciones confirmadas" warning="Atención: No mezcles envíos que vayan a ser recolectados por Zipnova con envíos a recolectar directamente por otros transportes, de lo contrario tus envíos fallarán y deberás hacerlos nuevamente.">
            {confirmedCollections.map((collection) => (
              <CollectionRow key={collection.collectionKey} collection={collection} kind="confirmed" onDetail={setSelectedCollection} onDownload={downloadLabels} />
            ))}
            {!confirmedCollections.length ? <div style={{ padding: '20px', color: 'var(--text-muted)' }}>No hay recolecciones confirmadas activas.</div> : null}
          </CollectionsPanel>

          <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 12px' }}>Próximas recolecciones posibles</h3>
          <CollectionsPanel title="A recolectar por Zipnova">
            {possibleCollections.map((collection) => (
              <CollectionRow key={collection.collectionKey} collection={collection} kind="possible" onDetail={setSelectedCollection} onDownload={downloadLabels} />
            ))}
            {!possibleCollections.length ? <div style={{ padding: '20px', color: 'var(--text-muted)' }}>No hay próximas recolecciones posibles.</div> : null}
          </CollectionsPanel>

          <CollectionDetail collection={selectedCollection} onClose={() => setSelectedCollection(null)} onDownload={downloadLabels} />

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
