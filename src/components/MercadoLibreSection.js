"use client";

import { useCallback, useEffect, useState } from "react";
import { formatArgentinaDate, formatArgentinaDateTime } from "@/lib/dateUtils";
import { toast } from "@/lib/api";

function formatMoney(total, currency) {
  const numeric = Number(total);
  if (Number.isNaN(numeric)) return total ? `${currency || ''} ${total}`.trim() : '-';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency || 'ARS' }).format(numeric);
}

function statusColor(order) {
  const sub = String(order.shipmentSubstatus || '').toLowerCase();
  const status = String(order.shipmentStatus || '').toLowerCase();
  if (sub.includes('delayed')) return '#ef4444';
  if (status === 'delivered' || status === 'shipped') return '#22c55e';
  if (status === 'ready_to_ship') return '#f97316';
  return '#64748b';
}

function logisticLabel(order) {
  if (order.logisticType === 'self_service') return 'Flex';
  if (order.logisticType === 'cross_docking') return 'Colecta';
  return order.logisticType || order.shippingMethod || 'Envio';
}

function addressLabel(address = {}) {
  return address.address_line || [address.street_name, address.street_number, address.city?.name, address.state?.name].filter(Boolean).join(', ');
}

function OrderCard({ order, onImport, importing }) {
  const color = statusColor(order);
  const products = Array.isArray(order.products) ? order.products : [];
  const totalUnits = products.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  const productNames = products.map((item) => item.name).filter(Boolean).slice(0, 2).join(' · ');
  const delayed = order.delays && (Array.isArray(order.delays?.delays) ? order.delays.delays.length : true);

  return (
    <div className="mobile-card" style={{ display: 'block', padding: '18px' }}>
      <div className="flex-between" style={{ alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <div className="mobile-card-title" style={{ fontSize: '20px', marginBottom: '4px' }}>Venta #{order.id}</div>
          <div style={{ fontWeight: 650 }}>{order.recipientName || order.buyerNickname || 'Sin destinatario'}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>{logisticLabel(order)} · Envio {order.shipmentId || '-'}</div>
        </div>
        <span style={{ borderRadius: '999px', padding: '5px 9px', color, background: `${color}14`, border: `1px solid ${color}33`, fontSize: '12px', fontWeight: 800 }}>
          {delayed ? 'Demorado' : order.shipmentSubstatus || order.shipmentStatus || order.status || 'Sin estado'}
        </span>
      </div>

      <div style={{ display: 'grid', gap: '8px', marginTop: '14px', color: 'var(--text-muted)', fontSize: '13px' }}>
        <div><strong style={{ color: 'var(--text)' }}>Total:</strong> {formatMoney(order.total, order.currency)}</div>
        <div><strong style={{ color: 'var(--text)' }}>Fecha:</strong> {order.createdAt ? formatArgentinaDate(order.createdAt) : '-'}</div>
        <div><strong style={{ color: 'var(--text)' }}>Tracking:</strong> {order.trackingNumber || '-'}</div>
        <div><strong style={{ color: 'var(--text)' }}>Direccion:</strong> {addressLabel(order.address) || '-'}</div>
        <div><strong style={{ color: 'var(--text)' }}>Productos:</strong> {totalUnits || 0} unid. {productNames ? `· ${productNames}` : ''}</div>
        {order.leadTime?.estimated_handling_limit?.date ? (
          <div><strong style={{ color: 'var(--text)' }}>SLA despacho:</strong> {formatArgentinaDateTime(order.leadTime.estimated_handling_limit.date)}</div>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onImport(order)} disabled={importing || !order.shipmentId}>
          {importing ? 'Importando...' : order.labelImportedAt ? 'Reimportar etiqueta' : 'Importar ZPL'}
        </button>
        {order.shipmentRowId ? <span style={{ color: 'var(--success)', fontSize: '12px', alignSelf: 'center' }}>En operacion #{order.shipmentRowId}</span> : null}
      </div>
    </div>
  );
}

export default function MercadoLibreSection({ currentUser }) {
  const canManageIntegration = ['owner', 'admin'].includes(currentUser?.role);
  const [connected, setConnected] = useState(false);
  const [connections, setConnections] = useState([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [orders, setOrders] = useState([]);
  const [view, setView] = useState('ready');
  const [search, setSearch] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [importingId, setImportingId] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/mercadolibre/status');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo consultar Mercado Libre');
      setConnected(Boolean(data.connected));
      const nextConnections = Array.isArray(data.connections) ? data.connections : [];
      setConnections(nextConnections);
      setSelectedConnectionId((prev) => prev && nextConnections.some((item) => String(item.id) === String(prev)) ? prev : '');
    } catch (err) {
      setError(err.message || 'Error inesperado');
    }
  }, []);

  const load = useCallback(async ({ syncMode = '0', q = search } = {}) => {
    setLoading(syncMode !== 'force');
    setSyncing(syncMode === 'force');
    setError('');
    setWarning('');
    try {
      const params = new URLSearchParams({ sync: syncMode, view });
      if (q) params.set('q', q);
      if (selectedConnectionId) params.set('connection_id', selectedConnectionId);
      const res = await fetch(`/api/admin/mercadolibre?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar Mercado Libre');
      setOrders(data.orders || []);
      setWarning(data.warning || '');
      setLastSyncedAt(data.lastSyncedAt || '');
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [search, selectedConnectionId, view]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('meli_connected') === '1') {
      setWarning('Integracion con Mercado Libre conectada correctamente.');
      window.history.replaceState({}, '', window.location.pathname + '?tab=mercadolibre');
      loadStatus();
    }
    const meliError = params.get('meli_error');
    if (meliError) {
      setError(decodeURIComponent(meliError));
      window.history.replaceState({}, '', window.location.pathname + '?tab=mercadolibre');
    }
  }, [loadStatus]);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { if (connected) load({ syncMode: '0' }); }, [connected, selectedConnectionId, view, load]);

  const handleConnect = async () => {
    setConnecting(true);
    setError('');
    try {
      const res = await fetch('/api/admin/mercadolibre/connect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar Mercado Libre');
      window.location.href = data.authorizeUrl;
    } catch (err) {
      setError(err.message || 'Error inesperado');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!selectedConnectionId) return;
    if (!confirm('¿Seguro que queres desconectar esta cuenta Mercado Libre?')) return;
    try {
      const res = await fetch(`/api/admin/mercadolibre/connect?connection_id=${encodeURIComponent(selectedConnectionId)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo desconectar');
      toast('Cuenta Mercado Libre desconectada', 'success');
      await loadStatus();
    } catch (err) {
      setError(err.message || 'Error inesperado');
    }
  };

  const handleImport = async (order) => {
    if (!order.connectionId) return;
    setImportingId(order.id);
    try {
      const res = await fetch('/api/admin/mercadolibre/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, connectionId: order.connectionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo importar la etiqueta');
      toast('Etiqueta Mercado Libre importada a la operacion', 'success');
      await load({ syncMode: '0' });
    } catch (err) {
      toast(err.message || 'Error al importar etiqueta', 'error');
    } finally {
      setImportingId('');
    }
  };

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Mercado Libre</h2>
        <p className="section-subtitle">Ventas pagadas, estados reales de envio, SLA e importacion directa de ZPL a la operacion GeoModi.</p>
      </div>

      {error ? <div className="card" style={{ marginBottom: '10px', color: 'var(--danger)' }}>{error}</div> : null}
      {warning ? <div className="card" style={{ marginBottom: '10px', color: 'var(--warning, #c2410c)' }}>{warning}</div> : null}

      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="form-row" style={{ alignItems: 'end' }}>
          {canManageIntegration ? <button type="button" className="btn btn-primary" onClick={handleConnect} disabled={connecting}>{connecting ? 'Conectando...' : 'Conectar cuenta Mercado Libre'}</button> : null}
          <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>La cuenta debe autorizar con el usuario principal vendedor.</div>
        </div>
      </div>

      {connected ? (
        <>
          <div className="card" style={{ marginBottom: '16px', padding: '14px' }}>
            <div className="form-row">
              <div className="form-group" style={{ minWidth: '230px' }}>
                <label className="form-label">Cuenta</label>
                <select className="form-input" value={selectedConnectionId} onChange={(e) => setSelectedConnectionId(e.target.value)}>
                  <option value="">Todas las cuentas</option>
                  {connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.displayName || connection.externalStoreId}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ minWidth: '210px' }}>
                <label className="form-label">Vista</label>
                <select className="form-input" value={view} onChange={(e) => setView(e.target.value)}>
                  <option value="ready">Listos para preparar</option>
                  <option value="flex">Flex</option>
                  <option value="colecta">Colecta</option>
                  <option value="delayed">Demorados</option>
                  <option value="imported">Importados</option>
                  <option value="">Todos</option>
                </select>
              </div>
              <div className="form-group" style={{ minWidth: '240px' }}>
                <label className="form-label">Buscar</label>
                <input className="form-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Venta, envio, tracking o cliente" />
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => load({ syncMode: '0' })}>Buscar</button>
              <button type="button" className="btn btn-primary" onClick={() => load({ syncMode: 'force' })} disabled={syncing}>{syncing ? 'Sincronizando...' : 'Sincronizar'}</button>
              {selectedConnectionId ? <button type="button" className="btn btn-ghost" onClick={handleDisconnect}>Desconectar</button> : null}
            </div>
            <div style={{ marginTop: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>
              {lastSyncedAt ? `Ultima actualizacion ${formatArgentinaDateTime(lastSyncedAt)}` : 'Sin ventas sincronizadas todavia'}
            </div>
          </div>

          {loading ? <div className="spinner"></div> : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {orders.map((order) => <OrderCard key={`${order.connectionId}-${order.id}`} order={order} onImport={handleImport} importing={importingId === order.id} />)}
              {!orders.length ? <div className="card" style={{ color: 'var(--text-muted)' }}>No hay ventas Mercado Libre para mostrar.</div> : null}
            </div>
          )}
        </>
      ) : (
        <div className="card" style={{ color: 'var(--text-muted)' }}>Conecta una cuenta Mercado Libre para sincronizar ventas pagadas.</div>
      )}
    </section>
  );
}
