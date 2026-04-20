"use client";

import { useCallback, useEffect, useState } from "react";

function formatOrderTotal(total, currency) {
  const numeric = Number(total);
  if (Number.isNaN(numeric)) return total ? `${currency || ''} ${total}`.trim() : '-';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency || 'ARS',
    minimumFractionDigits: 2,
  }).format(numeric);
}

function badgeStyle(color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
    border: `1px solid ${color}33`,
    color,
    background: `${color}12`,
    lineHeight: 1,
  };
}

function formatOrderDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function isSameArgentinaDay(value) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  const target = date.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  return today === target;
}

function getOperationalStatus(order) {
  const shippingStatus = String(order?.shippingStatus || '').toLowerCase();

  if (shippingStatus === 'shipped' || shippingStatus === 'delivered') {
    return { key: 'dispatched', label: 'Enviado', color: '#22c55e' };
  }

  return { key: 'to_send', label: 'Por enviar', color: '#f97316' };
}

function getStatusPriority(order) {
  return getOperationalStatus(order).key === 'to_send' ? 0 : 1;
}

function OrderCard({ order, isExpanded, onToggle }) {
  const shippingAddress = [
    order.shippingAddress?.address,
    order.shippingAddress?.number,
    order.shippingAddress?.city,
    order.shippingAddress?.province,
  ].filter(Boolean).join(', ');
  const operational = getOperationalStatus(order);

  return (
    <div className="mobile-card" style={{ display: 'block', marginBottom: 0, padding: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="mobile-card-title" style={{ fontSize: '20px', marginBottom: '4px' }}>
            Pedido #{order.number || order.id}
          </div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>{order.contactName || 'Sin nombre'}</div>
        </div>

        <button type="button" className="btn btn-ghost btn-sm" onClick={onToggle}>
          {isExpanded ? 'Ocultar' : 'Ver detalle'}
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
        <span style={badgeStyle(operational.color)}>{operational.label}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', marginTop: '14px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>Total:</strong> {formatOrderTotal(order.total, order.currency)}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>Fecha:</strong> {formatOrderDate(order.createdAt)}
        </div>
      </div>

      {isExpanded && (
        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            <strong style={{ color: 'var(--text)' }}>Envío:</strong> {shippingAddress || 'Sin dirección'}
            {order.shippingAddress?.zipcode ? ` · CP ${order.shippingAddress.zipcode}` : ''}
          </div>
          <div style={{ display: 'grid', gap: '6px' }}>
            {(order.products || []).slice(0, 5).map((product, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px' }}>
                <span style={{ color: 'var(--text)' }}>{product.name || 'Producto'}</span>
                <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>x{product.quantity || 1}</span>
              </div>
            ))}
            {(order.products || []).length > 5 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                +{(order.products || []).length - 5} productos más
              </div>
            ) : null}
            {(order.products || []).length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sin productos</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TiendanubeSection({ currentUser }) {
  const canManageIntegration = currentUser?.isGlobalAdmin || ['owner', 'admin'].includes(currentUser?.role);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const [connected, setConnected] = useState(false);
  const [connectedAt, setConnectedAt] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [verifyAfterOauth, setVerifyAfterOauth] = useState(false);
  const [pendingStoreId, setPendingStoreId] = useState('');

  const loadStatus = useCallback(async (retries = 5) => {
    try {
      const res = await fetch('/api/admin/tiendanube/status');
      const data = await res.json();
      if (res.ok) {
        setConnected(Boolean(data.connected));
        setConnectedAt(data.connectedAt || '');
        if (!data.connected && retries > 0) {
          setWarning('Verificando conexión con Tiendanube...');
          setTimeout(() => loadStatus(retries - 1), 2500);
          return;
        }
      } else {
        if (retries > 0) {
          setWarning('Verificando conexión con Tiendanube...');
          setTimeout(() => loadStatus(retries - 1), 2500);
          return;
        }
        setError(data.error || 'Error consultando estado de Tiendanube');
      }
    } catch (err) {
      console.error('Tiendanube status error', err);
      if (retries > 0) {
        setWarning('Verificando conexión con Tiendanube...');
        setTimeout(() => loadStatus(retries - 1), 2500);
        return;
      }
      setError('No se pudo verificar el estado de la conexión con Tiendanube');
    }
    setVerifyAfterOauth(false);
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
  }, [search]);

  const finishConnection = useCallback(async (storeId) => {
    try {
      const res = await fetch('/api/admin/tiendanube/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo finalizar la conexión');
      setWarning('Integración con Tiendanube conectada correctamente.');
      setPendingStoreId('');
      await loadStatus();
    } catch (err) {
      setError(err.message || 'Error inesperado');
      setWarning('');
      setVerifyAfterOauth(false);
    }
  }, [loadStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const storeId = params.get('tiendanube_store_id');
    const tiendanubeError = params.get('tiendanube_error');

    if (storeId) {
      setError('');
      setWarning('Finalizando conexión con Tiendanube...');
      setVerifyAfterOauth(true);
      setPendingStoreId(storeId);
      window.history.replaceState({}, '', window.location.pathname + '?tab=tiendanube');
      finishConnection(storeId);
    }

    if (tiendanubeError) {
      setError(decodeURIComponent(tiendanubeError));
      window.history.replaceState({}, '', window.location.pathname + '?tab=tiendanube');
      setVerifyAfterOauth(false);
      setPendingStoreId('');
    }
  }, [finishConnection]);

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
        const popup = window.open(data.authorizeUrl, 'tiendanube_oauth', 'width=800,height=600');
        if (!popup) {
          window.location.href = data.authorizeUrl;
          return;
        }
        const timer = setInterval(() => {
          if (popup.closed) {
            clearInterval(timer);
            setConnecting(false);
            loadStatus();
          }
        }, 500);
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

  const operationalOrders = orders.filter((o) => {
    const status = String(o.shippingStatus || '').toLowerCase();
    return status === 'shipped' || status === 'delivered' || status === 'unshipped' || status === 'ready_to_ship' || status === 'packed' || status === '';
  });
  const toDispatchCount = operationalOrders.filter((o) => getOperationalStatus(o).key === 'to_send').length;
  const dispatchedTodayCount = operationalOrders.filter((o) => {
    if (getOperationalStatus(o).key !== 'dispatched') return false;
    return isSameArgentinaDay(o.dispatchedAt);
  }).length;
  const totalActiveCount = operationalOrders.length;
  const compactWarning = /unauthorized|401|forbidden|invalid token/i.test(String(warning || ''))
    ? 'Sesión de Tiendanube vencida. Usá "Desconectar / Cambiar credenciales" para reconectar.'
    : warning;
  const compactError = /unauthorized|401|forbidden|invalid token/i.test(String(error || ''))
    ? 'Sesión de Tiendanube vencida. Reconectá la integración para continuar.'
    : error;
  const orderedOrders = [...operationalOrders].sort((a, b) => {
    const priorityDiff = getStatusPriority(a) - getStatusPriority(b);
    if (priorityDiff !== 0) return priorityDiff;
    const dateA = new Date(a.createdAt || 0).getTime();
    const dateB = new Date(b.createdAt || 0).getTime();
    return dateA - dateB;
  });

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Dashboard de envíos Zipnova</h2>
        <p className="section-subtitle">Pedidos de Tiendanube que necesitan atención operativa inmediata.</p>
      </div>

      {compactError ? <div className="card" style={{ marginBottom: '10px', padding: '10px 12px', fontSize: '13px', background: 'var(--danger-bg)', color: 'var(--danger)' }}>{compactError}</div> : null}
      {compactWarning ? (
        <div className="card" style={{ marginBottom: '10px', padding: '10px 12px', fontSize: '13px', background: 'var(--warning-bg, #fff7ed)', color: 'var(--warning, #c2410c)' }}>
          {compactWarning}
        </div>
      ) : null}

      {!connected ? (
        verifyAfterOauth ? (
          <div className="card" style={{ maxWidth: '520px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Finalizando conexión</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
              Estamos vinculando tu tienda Tiendanube con este workspace. Esperá un momento...
            </p>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Recargar página
            </button>
          </div>
        ) : pendingStoreId ? (
          <div className="card" style={{ maxWidth: '520px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>No se pudo completar la conexión</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
              Hubo un problema al vincular la autorización de Tiendanube con GeoModi. Probá de nuevo en unos segundos.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn btn-primary" onClick={() => finishConnection(pendingStoreId)} disabled={connecting}>
                {connecting ? 'Reintentando...' : 'Reintentar'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPendingStoreId('')}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="card" style={{ maxWidth: '520px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Conectar con Tiendanube</h3>
            {canManageIntegration ? (
              <>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
                  Iniciá sesión con tu cuenta de Tiendanube para sincronizar pedidos.
                </p>
                <button type="button" className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
                  {connecting ? 'Abriendo Tiendanube...' : 'Iniciar sesión con Tiendanube'}
                </button>
                <div style={{ marginTop: '14px', color: 'var(--text-muted)', fontSize: '12px' }}>
                  <p style={{ margin: '0 0 6px 0' }}>
                    <strong>Nota:</strong> si ya conectaste una tienda de prueba y querés usar tu tienda real:
                  </p>
                  <ol style={{ margin: 0, paddingLeft: '16px' }}>
                    <li style={{ marginBottom: '4px' }}>Desconectá la integración actual en GeoModi.</li>
                    <li style={{ marginBottom: '4px' }}><a href="https://www.tiendanube.com/login" target="_blank" rel="noreferrer">Cerrá sesión en Tiendanube</a> (o usá una ventana de incógnito).</li>
                    <li>Volvé a hacer clic en “Iniciar sesión con Tiendanube”.</li>
                  </ol>
                </div>
              </>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                Tiendanube no está configurado para este workspace. Contactá a un administrador para conectar la integración.
              </p>
            )}
          </div>
        )
      ) : (
        <>
          <div className="card" style={{ marginBottom: '12px' }}>
            <div className="flex-between" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                Integración activa {connectedAt ? `· Conectado el ${new Date(connectedAt).toLocaleString('es-AR')}` : ''}
              </div>
              {canManageIntegration ? (
                <button type="button" className="btn btn-ghost" onClick={handleDisconnect} disabled={connecting}>
                  {connecting ? 'Procesando...' : 'Desconectar / Cambiar credenciales'}
                </button>
              ) : null}
            </div>
          </div>
          <div className="card" style={{ marginBottom: '16px', padding: '12px 14px', color: 'var(--text-muted)', fontSize: '13px' }}>
            Vista operativa: solo envíos a domicilio de <strong>Zipnova/Zippin</strong>, con estados <strong>Por enviar</strong> y <strong>Enviado</strong>.
          </div>

          <div className="stats-grid" style={{ marginBottom: '16px' }}>
            <div className="stat-card card warning"><div className="stat-value">{toDispatchCount}</div><div className="stat-label">Por despachar</div></div>
            <div className="stat-card card success"><div className="stat-value">{dispatchedTodayCount}</div><div className="stat-label">Despachados hoy</div></div>
            <div className="stat-card card"><div className="stat-value" style={{ color: 'var(--text-secondary)' }}>{totalActiveCount}</div><div className="stat-label">Total activos</div></div>
          </div>

          <div className="card" style={{ marginBottom: '18px', padding: '14px' }}>
            <div className="form-row">
              <div className="form-group" style={{ minWidth: '280px' }}>
                <label className="form-label">Buscar</label>
                <input className="form-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Número de pedido o cliente" />
              </div>
              <div className="form-group" style={{ maxWidth: '180px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => load({ sync: true })} disabled={syncing}>
                  {syncing ? 'Sincronizando...' : 'Sincronizar'}
                </button>
              </div>
            </div>
          </div>

          {orderedOrders.length > 0 ? (
            <div className="zipnova-orders-grid" style={{ gap: '20px' }}>
              {orderedOrders.map((order) => (
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
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>No hay pedidos Zipnova pendientes o enviados para mostrar.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
