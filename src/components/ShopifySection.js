"use client";

import { useCallback, useEffect, useState } from "react";
import { formatArgentinaDate, formatArgentinaDateTime } from "@/lib/dateUtils";
import { toast } from "@/lib/api";

function formatOrderTotal(total, currency) {
  const numeric = Number(total);
  if (Number.isNaN(numeric)) return total ? `${currency || ''} ${total}`.trim() : '-';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency || 'ARS' }).format(numeric);
}

function getOperationalStatus(order) {
  const status = String(order?.fulfillmentStatus || '').toLowerCase();
  if (status === 'fulfilled') return { label: 'Despachado', color: '#22c55e' };
  return { label: 'Por enviar', color: '#f97316' };
}

function OrderCard({ order }) {
  const operational = getOperationalStatus(order);
  const products = Array.isArray(order.products) ? order.products : [];
  const address = [order.shippingAddress?.address1, order.shippingAddress?.city, order.shippingAddress?.province].filter(Boolean).join(', ');
  return (
    <div className="mobile-card" style={{ display: 'block', padding: '18px' }}>
      <div className="flex-between" style={{ alignItems: 'flex-start', gap: '12px' }}>
        <div>
          <div className="mobile-card-title" style={{ fontSize: '20px', marginBottom: '4px' }}>{order.number || order.legacyId}</div>
          <div style={{ fontWeight: 650 }}>{order.contactName || 'Sin nombre'}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>{order.externalStoreId}</div>
        </div>
        <span style={{ borderRadius: '999px', padding: '5px 9px', color: operational.color, background: `${operational.color}14`, border: `1px solid ${operational.color}33`, fontSize: '12px', fontWeight: 800 }}>{operational.label}</span>
      </div>
      <div style={{ display: 'grid', gap: '8px', marginTop: '14px', color: 'var(--text-muted)', fontSize: '13px' }}>
        <div><strong style={{ color: 'var(--text)' }}>Total:</strong> {formatOrderTotal(order.total, order.currency)}</div>
        <div><strong style={{ color: 'var(--text)' }}>Fecha:</strong> {order.createdAt ? formatArgentinaDate(order.createdAt) : '-'}</div>
        <div><strong style={{ color: 'var(--text)' }}>Envío:</strong> {address || 'Sin dirección'}</div>
        <div><strong style={{ color: 'var(--text)' }}>Productos:</strong> {products.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0)} unid.</div>
      </div>
    </div>
  );
}

export default function ShopifySection({ currentUser }) {
  const canManageIntegration = ['owner', 'admin'].includes(currentUser?.role);
  const [connected, setConnected] = useState(false);
  const [connections, setConnections] = useState([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [orders, setOrders] = useState([]);
  const [shop, setShop] = useState('');
  const [search, setSearch] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/shopify/status');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo consultar Shopify');
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
      const params = new URLSearchParams({ sync: syncMode });
      if (q) params.set('q', q);
      if (selectedConnectionId) params.set('connection_id', selectedConnectionId);
      const res = await fetch(`/api/admin/shopify?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar Shopify');
      setOrders(data.orders || []);
      setWarning(data.warning || '');
      setLastSyncedAt(data.lastSyncedAt || '');
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [search, selectedConnectionId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('shopify_connected') === '1') {
      setWarning('Integración con Shopify conectada correctamente.');
      window.history.replaceState({}, '', window.location.pathname + '?tab=shopify');
      loadStatus();
    }
    const shopifyWarning = params.get('shopify_warning');
    if (shopifyWarning) {
      setWarning(decodeURIComponent(shopifyWarning));
      window.history.replaceState({}, '', window.location.pathname + '?tab=shopify');
    }
    const shopifyError = params.get('shopify_error');
    if (shopifyError) {
      setError(decodeURIComponent(shopifyError));
      window.history.replaceState({}, '', window.location.pathname + '?tab=shopify');
    }
  }, [loadStatus]);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { if (connected) load({ syncMode: '0' }); }, [connected, selectedConnectionId, load]);

  const handleConnect = async (e) => {
    e.preventDefault();
    setConnecting(true);
    setError('');
    try {
      const res = await fetch('/api/admin/shopify/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar Shopify');
      window.location.href = data.authorizeUrl;
    } catch (err) {
      setError(err.message || 'Error inesperado');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!selectedConnectionId) return;
    if (!confirm('¿Seguro que querés desconectar esta tienda Shopify?')) return;
    try {
      const res = await fetch(`/api/admin/shopify/connect?connection_id=${encodeURIComponent(selectedConnectionId)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo desconectar');
      toast('Tienda Shopify desconectada', 'success');
      await loadStatus();
    } catch (err) {
      setError(err.message || 'Error inesperado');
    }
  };

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Dashboard de envíos Shopify</h2>
        <p className="section-subtitle">Pedidos Shopify sincronizados por tienda para operación logística.</p>
      </div>

      {error ? <div className="card" style={{ marginBottom: '10px', color: 'var(--danger)' }}>{error}</div> : null}
      {warning ? <div className="card" style={{ marginBottom: '10px', color: 'var(--warning, #c2410c)' }}>{warning}</div> : null}

      <div className="card" style={{ marginBottom: '16px' }}>
        <form onSubmit={handleConnect} className="form-row" style={{ alignItems: 'end' }}>
          <div className="form-group" style={{ minWidth: '280px' }}>
            <label className="form-label">Nueva tienda Shopify</label>
            <input className="form-input" value={shop} onChange={(e) => setShop(e.target.value)} placeholder="mi-tienda.myshopify.com" />
          </div>
          {canManageIntegration ? <button type="submit" className="btn btn-primary" disabled={connecting || !shop}>{connecting ? 'Conectando...' : 'Conectar Shopify'}</button> : null}
        </form>
      </div>

      {connected ? (
        <>
          <div className="card" style={{ marginBottom: '16px', padding: '14px' }}>
            <div className="form-row">
              <div className="form-group" style={{ minWidth: '240px' }}>
                <label className="form-label">Tienda</label>
                <select className="form-input" value={selectedConnectionId} onChange={(e) => setSelectedConnectionId(e.target.value)}>
                  <option value="">Todas las tiendas</option>
                  {connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.displayName || connection.externalStoreId}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ minWidth: '260px' }}>
                <label className="form-label">Buscar</label>
                <input className="form-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pedido o cliente" />
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => load({ syncMode: '0' })}>Buscar</button>
              <button type="button" className="btn btn-primary" onClick={() => load({ syncMode: 'force' })} disabled={syncing}>{syncing ? 'Sincronizando...' : 'Sincronizar'}</button>
              {selectedConnectionId ? <button type="button" className="btn btn-ghost" onClick={handleDisconnect}>Desconectar tienda</button> : null}
            </div>
            <div style={{ marginTop: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>
              {lastSyncedAt ? `Última actualización ${formatArgentinaDateTime(lastSyncedAt)}` : 'Sin pedidos sincronizados todavía'}
            </div>
          </div>

          {loading ? <div className="spinner"></div> : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {orders.map((order) => <OrderCard key={`${order.connectionId}-${order.id}`} order={order} />)}
              {!orders.length ? <div className="card" style={{ color: 'var(--text-muted)' }}>No hay pedidos Shopify para mostrar.</div> : null}
            </div>
          )}
        </>
      ) : (
        <div className="card" style={{ color: 'var(--text-muted)' }}>Conectá una tienda Shopify para empezar a sincronizar pedidos.</div>
      )}
    </section>
  );
}
