"use client";

import { useCallback, useEffect, useState } from "react";
import { formatArgentinaDateTime, getArgentinaDateString } from "@/lib/dateUtils";

const DEFAULT_BASE_URL = 'https://apitest.correoargentino.com.ar/paqar/v1';

const DEFAULT_SHIPMENT_PAYLOAD = {
  sellerId: '',
  trackingNumber: '',
  order: {
    senderData: {
      id: '',
      businessName: '',
      areaCodePhone: '',
      phoneNumber: '',
      areaCodeCellphone: '',
      cellphoneNumber: '',
      email: '',
      observation: '',
      address: {
        streetName: '',
        streetNumber: '',
        cityName: '',
        floor: '',
        department: '',
        state: '',
        zipCode: '',
      },
    },
    shippingData: {
      name: '',
      areaCodePhone: '',
      phoneNumber: '',
      areaCodeCellphone: '',
      cellphoneNumber: '',
      email: '',
      observation: '',
      address: {
        streetName: '',
        streetNumber: '',
        cityName: '',
        floor: '',
        department: '',
        state: '',
        zipCode: '',
      },
    },
    parcels: [{
      dimensions: { height: '10', width: '10', depth: '10' },
      productWeight: '1000',
      productCategory: 'general',
      declaredValue: '1000',
    }],
    deliveryType: 'homeDelivery',
    agencyId: '',
    saleDate: new Date().toISOString(),
    shipmentClientId: `geomodi-${getArgentinaDateString()}`,
    serviceType: 'CP',
  },
};

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function parseJsonInput(value, label) {
  try {
    return value.trim() ? JSON.parse(value) : {};
  } catch (error) {
    throw new Error(`${label} no es JSON válido`);
  }
}

function formatDate(value) {
  if (!value) return '-';
  return formatArgentinaDateTime(value);
}

function ResponseBox({ title, value }) {
  if (!value) return null;
  return (
    <div className="card" style={{ marginTop: '12px' }}>
      <h4 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '8px' }}>{title}</h4>
      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
        {prettyJson(value)}
      </pre>
    </div>
  );
}

export default function CorreoArgentinoSection({ currentUser }) {
  const canManageIntegration = ['owner', 'admin'].includes(currentUser?.role);
  const [connected, setConnected] = useState(false);
  const [connectedAt, setConnectedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [shipments, setShipments] = useState([]);

  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useState('');
  const [agreement, setAgreement] = useState('');
  const [sellerId, setSellerId] = useState('');

  const [agencyStateId, setAgencyStateId] = useState('');
  const [agencyResponse, setAgencyResponse] = useState(null);
  const [shipmentPayload, setShipmentPayload] = useState(() => prettyJson(DEFAULT_SHIPMENT_PAYLOAD));
  const [shipmentResponse, setShipmentResponse] = useState(null);
  const [tracking, setTracking] = useState('');
  const [trackingResponse, setTrackingResponse] = useState(null);
  const [labelResponse, setLabelResponse] = useState(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/correo-argentino/status');
      const data = await res.json();
      if (res.ok) {
        setConnected(Boolean(data.connected));
        setConnectedAt(data.connectedAt || '');
      }
    } catch (err) {
      console.error('Correo Argentino status error', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadShipments = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/correo-argentino/shipments?limit=50');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar envíos');
      setShipments(data.shipments || []);
    } catch (err) {
      setWarning(err.message || 'No se pudieron cargar envíos locales');
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (connected) loadShipments();
  }, [connected, loadShipments]);

  const handleConnect = async (event) => {
    event.preventDefault();
    setWorking(true);
    setError('');
    setWarning('');
    try {
      const res = await fetch('/api/admin/correo-argentino/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, apiKey, agreement, sellerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo conectar Correo Argentino');
      setApiKey('');
      await loadStatus();
      setWarning('Integración local de Correo Argentino conectada correctamente.');
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setWorking(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('¿Seguro que querés desconectar Correo Argentino?')) return;
    setWorking(true);
    setError('');
    try {
      const res = await fetch('/api/admin/correo-argentino/connect', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo desconectar');
      setConnected(false);
      setConnectedAt('');
      setShipments([]);
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setWorking(false);
    }
  };

  const handleAgencies = async () => {
    setWorking(true);
    setError('');
    setAgencyResponse(null);
    try {
      const params = new URLSearchParams();
      if (agencyStateId) params.set('stateId', agencyStateId);
      params.set('pickup_availability', 'true');
      params.set('package_reception', 'true');
      const res = await fetch(`/api/admin/correo-argentino/agencies?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudieron consultar agencias');
      setAgencyResponse(data.response);
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setWorking(false);
    }
  };

  const handleShipment = async () => {
    setWorking(true);
    setError('');
    setShipmentResponse(null);
    try {
      const payload = parseJsonInput(shipmentPayload, 'El payload de envío');
      const res = await fetch('/api/admin/correo-argentino/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear el envío');
      setShipmentResponse(data.response);
      await loadShipments();
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setWorking(false);
    }
  };

  const handleTracking = async (trackingOverride = '') => {
    const value = String(trackingOverride || tracking || '').trim();
    if (!value) {
      setError('Ingresá un número de tracking');
      return;
    }
    setWorking(true);
    setError('');
    setTrackingResponse(null);
    try {
      const res = await fetch(`/api/admin/correo-argentino/tracking?tracking=${encodeURIComponent(value)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo consultar tracking');
      setTracking(value);
      setTrackingResponse(data.response);
      await loadShipments();
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setWorking(false);
    }
  };

  const handleLabel = async (trackingOverride = '') => {
    const value = String(trackingOverride || tracking || '').trim();
    if (!value) {
      setError('Ingresá un número de tracking para obtener el rótulo');
      return;
    }
    setWorking(true);
    setError('');
    setLabelResponse(null);
    try {
      const res = await fetch('/api/admin/correo-argentino/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: [{ sellerId, trackingNumber: value }], labelFormat: '10x15' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo obtener el rótulo');
      setTracking(value);
      setLabelResponse(data.response);
      const label = Array.isArray(data.response) ? data.response.find((item) => item?.fileBase64) : null;
      if (label?.fileBase64) {
        const a = document.createElement('a');
        a.href = `data:application/pdf;base64,${label.fileBase64}`;
        a.download = label.fileName || label.filename || `rotulo-${value}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <section className="section">
        <div className="spinner"></div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Correo Argentino</h2>
        <p className="section-subtitle">MVP local para PAQ.AR API 2.0: conectar credenciales, crear órdenes, consultar tracking y descargar rótulos.</p>
      </div>

      {error ? <div className="card" style={{ marginBottom: '12px', background: 'var(--danger-bg)', color: 'var(--danger)' }}>{error}</div> : null}
      {warning ? <div className="card" style={{ marginBottom: '12px', background: 'var(--warning-bg, #fff7ed)', color: 'var(--warning, #c2410c)' }}>{warning}</div> : null}

      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="flex-between" style={{ flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '4px' }}>Conexión local</h3>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              {connected ? `Activa${connectedAt ? ` · ${formatDate(connectedAt)}` : ''}` : 'Sin conectar'}
            </div>
          </div>
          {connected && canManageIntegration ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleDisconnect} disabled={working}>
              Desconectar
            </button>
          ) : null}
        </div>

        {canManageIntegration ? (
          <form onSubmit={handleConnect}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Base URL</label>
                <input className="form-input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={DEFAULT_BASE_URL} />
              </div>
              <div className="form-group">
                <label className="form-label">Agreement</label>
                <input className="form-input" value={agreement} onChange={(e) => setAgreement(e.target.value)} placeholder="Ej. 18017" required />
              </div>
              <div className="form-group">
                <label className="form-label">API key</label>
                <input className="form-input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key PAQ.AR" required />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Seller ID opcional</label>
                <input className="form-input" value={sellerId} onChange={(e) => setSellerId(e.target.value)} placeholder="Si se omite usa agreement" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={working || !agreement || !apiKey}>
              {working ? 'Validando...' : connected ? 'Validar y actualizar credenciales' : 'Conectar Correo Argentino'}
            </button>
          </form>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Contactá a un administrador del workspace para conectar la integración.</p>
        )}
      </div>

      {connected ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px', alignItems: 'start', marginBottom: '18px' }}>
            <div className="card">
              <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '12px' }}>Agencias</h3>
              <div className="form-row" style={{ alignItems: 'end' }}>
                <div className="form-group">
                  <label className="form-label">Provincia opcional</label>
                  <input className="form-input" value={agencyStateId} onChange={(e) => setAgencyStateId(e.target.value)} placeholder="Código ISO, ej. B" />
                </div>
                <div className="form-group" style={{ maxWidth: '180px' }}>
                  <button type="button" className="btn btn-primary" onClick={handleAgencies} disabled={working}>Consultar</button>
                </div>
              </div>
              <ResponseBox title="Respuesta agencias" value={agencyResponse} />
            </div>

            <div className="card">
              <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '12px' }}>Tracking</h3>
              <div className="form-row" style={{ alignItems: 'end' }}>
                <div className="form-group">
                  <label className="form-label">Número de tracking</label>
                  <input className="form-input" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Tracking Correo Argentino" />
                </div>
                <div className="form-group" style={{ maxWidth: '180px' }}>
                  <button type="button" className="btn btn-primary" onClick={() => handleTracking()} disabled={working}>Consultar</button>
                  <button type="button" className="btn btn-ghost" onClick={() => handleLabel()} disabled={working} style={{ marginTop: '8px' }}>Rótulo 10x15</button>
                </div>
              </div>
              <ResponseBox title="Respuesta tracking" value={trackingResponse} />
              <ResponseBox title="Respuesta rótulo" value={labelResponse} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px', alignItems: 'start', marginBottom: '18px' }}>
            <div className="card">
              <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '8px' }}>Crear orden</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '10px' }}>Payload manual para `POST /orders`. Usá códigos de provincia PAQ.AR: B Buenos Aires, C CABA, X Córdoba, etc.</p>
              <textarea className="form-input" value={shipmentPayload} onChange={(e) => setShipmentPayload(e.target.value)} rows={20} style={{ fontFamily: 'monospace' }} />
              <button type="button" className="btn btn-primary" onClick={handleShipment} disabled={working} style={{ marginTop: '10px' }}>Crear orden</button>
              <ResponseBox title="Respuesta creación" value={shipmentResponse} />
            </div>
          </div>

          <div className="card">
            <div className="flex-between" style={{ flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Envíos locales creados</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={loadShipments} disabled={working}>Actualizar lista</button>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Referencia</th>
                    <th>Tracking</th>
                    <th>Destinatario</th>
                    <th>Estado</th>
                    <th>Creado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((shipment) => (
                    <tr key={shipment.id}>
                      <td>{shipment.externalReference || shipment.correoShippingId || '-'}</td>
                      <td>{shipment.trackingNumber || '-'}</td>
                      <td>{shipment.recipientName || '-'}</td>
                      <td>{shipment.status || '-'}</td>
                      <td>{formatDate(shipment.createdAt)}</td>
                      <td>
                        {shipment.trackingNumber ? (
                          <>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleTracking(shipment.trackingNumber)} disabled={working}>
                              Tracking
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleLabel(shipment.trackingNumber)} disabled={working} style={{ marginLeft: '6px' }}>
                              Rótulo
                            </button>
                          </>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                  {!shipments.length ? (
                    <tr>
                      <td colSpan="6" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>Todavía no hay envíos creados localmente.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
