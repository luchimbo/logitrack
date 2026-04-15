"use client";

import { useCallback, useEffect, useState } from "react";

function OrderCard({ order, isExpanded, onToggle }) {
  const statusColors = {
    open: '#16a34a',
    closed: '#2563eb',
    cancelled: '#dc2626',
  };
  const paymentStatusColors = {
    pending: '#c2410c',
    paid: '#16a34a',
    refunded: '#dc2626',
    partially_refunded: '#d97706',
    authorized: '#2563eb',
    voided: '#6b7280',
    abandoned: '#6b7280',
  };

  return (
    <div className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
      <div className="mobile-card-title" onClick={onToggle} style={{ cursor: 'pointer' }}>
        Pedido #{order.number}
      </div>
      <div className="mobile-card-body" style={{ marginTop: '8px' }}>
        <div className="mobile-card-row">
          <span className="mobile-card-label">Cliente</span>
          <span className="mobile-card-value">{order.contactName || '-'}</span>
        </div>
        <div className="mobile-card-row">
          <span className="mobile-card-label">Email</span>
          <span className="mobile-card-value">{order.contactEmail || '-'}</span>
        </div>
        <div className="mobile-card-row">
          <span className="mobile-card-label">Estado</span>
          <span className="mobile-card-value" style={{ color: statusColors[order.status] || 'var(--text-muted)' }}>
            {order.status || '-'}
          </span>
        </div>
        <div className="mobile-card-row">
          <span className="mobile-card-label">Pago</span>
          <span className="mobile-card-value" style={{ color: paymentStatusColors[order.paymentStatus] || 'var(--text-muted)' }}>
            {order.paymentStatus || '-'}
          </span>
        </div>
        <div className="mobile-card-row">
          <span className="mobile-card-label">Envío</span>
          <span className="mobile-card-value">{order.shippingStatus || '-'}</span>
        </div>
        <div className="mobile-card-row">
          <span className="mobile-card-label">Total</span>
          <span className="mobile-card-value">{order.total ? `${order.currency || ''} ${order.total}` : '-'}</span>
        </div>
        <div className="mobile-card-row">
          <span className="mobile-card-label">Fecha</span>
          <span className="mobile-card-value">{order.createdAt ? new Date(order.createdAt).toLocaleString('es-AR') : '-'}</span>
        </div>

        {isExpanded && (
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Dirección de envío</h4>
            <div className="mobile-card-row">
              <span className="mobile-card-label">Calle</span>
              <span className="mobile-card-value">{[order.shippingAddress?.address, order.shippingAddress?.number].filter(Boolean).join(' ') || '-'}</span>
            </div>
            {order.shippingAddress?.floor ? (
              <div className="mobile-card-row">
                <span className="mobile-card-label">Piso/Depto</span>
                <span className="mobile-card-value">{order.shippingAddress.floor}</span>
              </div>
            ) : null}
            <div className="mobile-card-row">
              <span className="mobile-card-label">Ciudad</span>
              <span className="mobile-card-value">{order.shippingAddress?.city || '-'}</span>
            </div>
            <div className="mobile-card-row">
              <span className="mobile-card-label">Provincia</span>
              <span className="mobile-card-value">{order.shippingAddress?.province || '-'}</span>
            </div>
            <div className="mobile-card-row">
              <span className="mobile-card-label">CP</span>
              <span className="mobile-card-value">{order.shippingAddress?.zipcode || '-'}</span>
            </div>
            <div className="mobile-card-row">
              <span className="mobile-card-label">País</span>
              <span className="mobile-card-value">{order.shippingAddress?.country || '-'}</span>
            </div>
            {order.shippingAddress?.phone ? (
              <div className="mobile-card-row">
                <span className="mobile-card-label">Teléfono</span>
                <span className="mobile-card-value">{order.shippingAddress.phone}</span>
              </div>
            ) : null}

            <h4 style={{ fontSize: '14px', fontWeight: 600, marginTop: '16px', marginBottom: '8px' }}>Productos</h4>
            <div style={{ display: 'grid', gap: '8px' }}>
              {(order.products || []).map((product, idx) => (
                <div key={idx} className="mobile-card" style={{ display: 'block', marginBottom: 0, background: 'var(--bg-secondary, #f8fafc)' }}>
                  <div className="mobile-card-title" style={{ fontSize: '13px' }}>{product.name}</div>
                  <div className="mobile-card-body" style={{ marginTop: '4px' }}>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Cantidad</span>
                      <span className="mobile-card-value">{product.quantity}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Precio</span>
                      <span className="mobile-card-value">{product.price ? `${order.currency || ''} ${product.price}` : '-'}</span>
                    </div>
                    {product.sku ? (
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">SKU</span>
                        <span className="mobile-card-value">{product.sku}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {(order.products || []).length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Sin productos</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TiendanubeSection({ currentUser }) {
  const canManageIntegration = currentUser?.isGlobalAdmin || ['owner', 'admin'].includes(currentUser?.role);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const [connected, setConnected] = useState(false);
  const [connectedAt, setConnectedAt] = useState('');
  const [connecting, setConnecting] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/tiendanube/status');
      const data = await res.json();
      if (res.ok) {
        setConnected(Boolean(data.connected));
        setConnectedAt(data.connectedAt || '');
      }
    } catch (err) {
      console.error('Tiendanube status error', err);
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
      if (search) params.set('q', search);
      if (statusFilter) params.set('status', statusFilter);
      if (paymentFilter) params.set('payment_status', paymentFilter);
      if (!sync) params.set('sync', '0');
      const res = await fetch(`/api/admin/tiendanube?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar Tiendanube');
      setOrders(data.orders || []);
      setWarning(data.warning || '');
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [search, statusFilter, paymentFilter]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tiendanube_connected') === '1') {
      setError('');
      setWarning('Integración con Tiendanube conectada correctamente.');
      window.history.replaceState({}, '', window.location.pathname + '?tab=tiendanube');
      loadStatus();
    }
    const tiendanubeError = params.get('tiendanube_error');
    if (tiendanubeError) {
      setError(decodeURIComponent(tiendanubeError));
      window.history.replaceState({}, '', window.location.pathname + '?tab=tiendanube');
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
      const res = await fetch('/api/admin/tiendanube/connect', { method: 'POST' });
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
    if (!confirm('¿Seguro que quieres desconectar la integración con Tiendanube?')) return;
    setConnecting(true);
    setError('');
    try {
      const res = await fetch('/api/admin/tiendanube/connect', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo desconectar');
      await loadStatus();
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setConnecting(false);
    }
  };

  const activeCount = orders.filter((o) => o.status === 'open').length;
  const closedCount = orders.filter((o) => o.status === 'closed').length;
  const cancelledCount = orders.filter((o) => o.status === 'cancelled').length;

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Tiendanube</h2>
        <p className="section-subtitle">Integración con Tiendanube para ver pedidos y órdenes de tu tienda online.</p>
      </div>

      {error ? <div className="card" style={{ marginBottom: '12px', background: 'var(--danger-bg)', color: 'var(--danger)' }}>{error}</div> : null}
      {warning ? <div className="card" style={{ marginBottom: '12px', background: 'var(--warning-bg, #fff7ed)', color: 'var(--warning, #c2410c)' }}>{warning}</div> : null}

      {!connected ? (
        <div className="card" style={{ maxWidth: '520px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Conectar con Tiendanube</h3>
          {canManageIntegration ? (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
                Iniciá sesión con tu cuenta de Tiendanube para sincronizar pedidos.
              </p>
              <button type="button" className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
                {connecting ? 'Redirigiendo...' : 'Iniciar sesión con Tiendanube'}
              </button>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              Tiendanube no está configurado para este workspace. Contactá a un administrador para conectar la integración.
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

          <div className="stats-grid" style={{ marginBottom: '18px' }}>
            <div className="stat-card card accent"><div className="stat-value">{orders.length}</div><div className="stat-label">Total pedidos</div></div>
            <div className="stat-card card info"><div className="stat-value">{activeCount}</div><div className="stat-label">Abiertos</div></div>
            <div className="stat-card card success"><div className="stat-value">{closedCount}</div><div className="stat-label">Cerrados</div></div>
            <div className="stat-card card"><div className="stat-value">{cancelledCount}</div><div className="stat-label">Cancelados</div></div>
          </div>

          <div className="card" style={{ marginBottom: '18px' }}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Buscar</label>
                <input className="form-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Número, nombre o email" />
              </div>
              <div className="form-group" style={{ maxWidth: '160px' }}>
                <label className="form-label">Estado</label>
                <select className="form-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="open">Abierto</option>
                  <option value="closed">Cerrado</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>
              <div className="form-group" style={{ maxWidth: '160px' }}>
                <label className="form-label">Pago</label>
                <select className="form-input" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="pending">Pendiente</option>
                  <option value="paid">Pagado</option>
                  <option value="refunded">Reembolsado</option>
                  <option value="authorized">Autorizado</option>
                </select>
              </div>
              <div className="form-group" style={{ maxWidth: '140px' }}>
                <button type="button" className="btn btn-primary" onClick={() => load({ sync: false })} disabled={loading}>
                  {loading ? 'Cargando...' : 'Buscar'}
                </button>
              </div>
              <div className="form-group" style={{ maxWidth: '180px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => load({ sync: true })} disabled={syncing}>
                  {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
                </button>
              </div>
            </div>
          </div>

          {orders.length > 0 ? (
            <div style={{ display: 'grid', gap: '10px' }}>
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  isExpanded={expandedId === order.id}
                  onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
                />
              ))}
            </div>
          ) : (
            <div className="card">
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>No se encontraron pedidos.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
