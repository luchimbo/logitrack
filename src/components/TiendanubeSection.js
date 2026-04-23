"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/lib/api";

let tiendanubeSectionCache = {
  orders: [],
  search: '',
  viewMode: 'to_send',
  connected: false,
  connectedAt: '',
  lastSyncedAt: '',
  initialized: false,
};

const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000;

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

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isSyncExpired(value) {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return true;
  return Date.now() - timestamp >= AUTO_SYNC_INTERVAL_MS;
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
    return { key: 'dispatched', label: 'Despachado', color: '#22c55e' };
  }

  return { key: 'to_send', label: 'Por enviar', color: '#f97316' };
}

function getRowActionConfig(order) {
  const operational = getOperationalStatus(order);

  if (operational.key === 'to_send') {
    return {
      status: 'dispatched',
      label: 'Despachado',
      style: {
        background: 'var(--success-bg, rgba(34,197,94,0.12))',
        color: 'var(--success, #16a34a)',
        border: '1px solid var(--success, #16a34a)',
      },
    };
  }

  return {
    status: 'to_send',
    label: 'Por enviar',
    style: {
      background: 'rgba(249,115,22,0.12)',
      color: '#f97316',
      border: '1px solid #f97316',
    },
  };
}

function getShippingProviderLabel(order) {
  const carrier = String(order?.shippingCarrier || '').trim();
  const method = String(order?.shippingMethod || '').trim();
  if (carrier && method) {
    return carrier.toLowerCase() === method.toLowerCase() ? carrier : `${carrier} · ${method}`;
  }
  return carrier || method || 'Envío a domicilio';
}

function getProductSummary(order) {
  const products = Array.isArray(order?.products) ? order.products : [];
  const totalUnits = products.reduce((sum, product) => sum + (Number(product?.quantity || 0) || 1), 0);
  const distinctNames = [...new Set(
    products
      .map((product) => String(product?.name || '').trim() || 'Producto')
      .filter(Boolean)
  )];

  if (!products.length) {
    return { label: 'Sin productos', detail: '-' };
  }

  if (distinctNames.length === 1) {
    return {
      label: `${totalUnits} unid.`,
      detail: distinctNames[0],
    };
  }

  const visibleNames = distinctNames.slice(0, 2).join(' · ');

  return {
    label: `${totalUnits} unid.`,
    detail: distinctNames.length > 2 ? `${visibleNames} +${distinctNames.length - 2} más` : visibleNames,
  };
}

function OrderDetails({ order }) {
  const operational = getOperationalStatus(order);
  const shippingAddress = [
    order.shippingAddress?.address,
    order.shippingAddress?.number,
    order.shippingAddress?.city,
    order.shippingAddress?.province,
  ].filter(Boolean).join(', ');

  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
        <strong style={{ color: 'var(--text)' }}>Estado Tiendanube:</strong> {operational.label}
        {order.shippingStatus ? ` · ${order.shippingStatus}` : ''}
      </div>
      {order.dispatchedAt ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>Despachado en Tiendanube:</strong> {formatDateTime(order.dispatchedAt)}
        </div>
      ) : null}
      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
        <strong style={{ color: 'var(--text)' }}>Envío:</strong> {shippingAddress || 'Sin dirección'}
        {order.shippingAddress?.zipcode ? ` · CP ${order.shippingAddress.zipcode}` : ''}
      </div>
      <div style={{ display: 'grid', gap: '6px' }}>
        {(order.products || []).slice(0, 6).map((product, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px' }}>
            <span style={{ color: 'var(--text)' }}>{product.name || 'Producto'}</span>
            <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>x{product.quantity || 1}</span>
          </div>
        ))}
        {(order.products || []).length > 6 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            +{(order.products || []).length - 6} productos más
          </div>
        ) : null}
        {(order.products || []).length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sin productos</div>
        ) : null}
      </div>
    </div>
  );
}

function OrderCard({ order, isExpanded, onToggle, selected, onSelectionToggle, onAction, updating }) {
  const operational = getOperationalStatus(order);
  const productSummary = getProductSummary(order);
  const actionConfig = getRowActionConfig(order);

  return (
    <div className="mobile-card" style={{ display: 'block', marginBottom: 0, padding: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, display: 'flex', gap: '12px', alignItems: 'flex-start', flex: 1 }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelectionToggle}
            aria-label={`Seleccionar pedido ${order.number || order.id}`}
            style={{ marginTop: '4px' }}
          />

          <div style={{ minWidth: 0 }}>
          <div className="mobile-card-title" style={{ fontSize: '20px', marginBottom: '4px' }}>
            Pedido #{order.number || order.id}
          </div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>{order.contactName || 'Sin nombre'}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{getShippingProviderLabel(order)}</div>
          </div>
        </div>

        <button type="button" className="btn btn-ghost btn-sm" onClick={onToggle}>
          {isExpanded ? 'Ocultar' : 'Ver detalle'}
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
        <span style={badgeStyle(operational.color)}>{operational.label}</span>
        <button type="button" className="btn btn-sm" onClick={onAction} disabled={updating} style={actionConfig.style}>
          {updating ? 'Guardando...' : actionConfig.label}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', marginTop: '14px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>Total:</strong> {formatOrderTotal(order.total, order.currency)}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>Fecha:</strong> {formatOrderDate(order.createdAt)}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
          <strong style={{ color: 'var(--text)' }}>Productos:</strong> {productSummary.label} · {productSummary.detail}
        </div>
      </div>

      {isExpanded && (
        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
          <OrderDetails order={order} />
        </div>
      )}
    </div>
  );
}

export default function TiendanubeSection({ currentUser }) {
  const canManageIntegration = currentUser?.isGlobalAdmin || ['owner', 'admin'].includes(currentUser?.role);
  const [orders, setOrders] = useState(() => tiendanubeSectionCache.orders || []);
  const [search, setSearch] = useState(() => tiendanubeSectionCache.search || '');
  const [viewMode, setViewMode] = useState(() => tiendanubeSectionCache.viewMode || 'to_send');
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [updatingOrderIds, setUpdatingOrderIds] = useState([]);
  const [loading, setLoading] = useState(() => !tiendanubeSectionCache.initialized);
  const [syncing, setSyncing] = useState(false);
  const [updatingDispatchStatus, setUpdatingDispatchStatus] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const [connected, setConnected] = useState(() => Boolean(tiendanubeSectionCache.connected));
  const [connectedAt, setConnectedAt] = useState(() => tiendanubeSectionCache.connectedAt || '');
  const [lastSyncedAt, setLastSyncedAt] = useState(() => tiendanubeSectionCache.lastSyncedAt || '');
  const [connecting, setConnecting] = useState(false);
  const [verifyAfterOauth, setVerifyAfterOauth] = useState(false);
  const [pendingStoreId, setPendingStoreId] = useState('');
  const [hasLoadedOrders, setHasLoadedOrders] = useState(() => Boolean(tiendanubeSectionCache.initialized));
  const searchRef = useRef(search);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    tiendanubeSectionCache = {
      orders,
      search,
      viewMode,
      connected,
      connectedAt,
      lastSyncedAt,
      initialized: hasLoadedOrders,
    };
  }, [orders, search, viewMode, connected, connectedAt, lastSyncedAt, hasLoadedOrders]);

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

  const load = useCallback(async ({ syncMode = 'auto', q } = {}) => {
    const showSyncing = syncMode === 'force';
    const showLoading = !showSyncing;

    if (showSyncing) {
      setSyncing(true);
    }
    if (showLoading) {
      setLoading(true);
    }
    setError('');
    setWarning('');
    try {
      const params = new URLSearchParams();
      const query = typeof q === 'string' ? q : searchRef.current;
      if (query) params.set('q', query);
      params.set('sync', syncMode);
      const res = await fetch(`/api/admin/tiendanube?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar Tiendanube');
      setOrders(data.orders || []);
      setWarning(data.warning || '');
      setLastSyncedAt(data.lastSyncedAt || '');
      setHasLoadedOrders(true);
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

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
      if (!hasLoadedOrders || isSyncExpired(lastSyncedAt)) {
        load({ syncMode: 'auto' });
      }
    }
  }, [connected, hasLoadedOrders, lastSyncedAt, load]);

  useEffect(() => {
    if (!connected) return undefined;

    const interval = setInterval(() => {
      load({ syncMode: 'auto' });
    }, AUTO_SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [connected, load]);

  useEffect(() => {
    setSelectedOrderIds((prev) => prev.filter((id) => orders.some((order) => order.id === id)));
  }, [orders]);

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

  const toggleOrderSelection = (id) => {
    setSelectedOrderIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const operationalOrders = orders.filter((o) => {
    const status = String(o.shippingStatus || '').toLowerCase();
    return status === 'shipped'
      || status === 'delivered'
      || status === 'unshipped'
      || status === 'ready_to_ship'
      || status === 'packed'
      || status === 'unpacked'
      || status === 'partially_packed'
      || status === 'partially_fulfilled'
      || status === '';
  });
  const toDispatchCount = operationalOrders.filter((o) => getOperationalStatus(o).key === 'to_send').length;
  const dispatchedTodayCount = operationalOrders.filter((o) => {
    if (getOperationalStatus(o).key !== 'dispatched') return false;
    return isSameArgentinaDay(o.dispatchedAt);
  }).length;
  const totalActiveCount = operationalOrders.length;
  const visibleOrders = operationalOrders.filter((o) => {
    const op = getOperationalStatus(o).key;
    if (viewMode === 'to_send') return op === 'to_send';
    if (viewMode === 'dispatched') return op === 'dispatched';
    return true;
  });
  const compactWarning = /unauthorized|401|forbidden|invalid token/i.test(String(warning || ''))
    ? 'Sesión de Tiendanube vencida. Usá "Desconectar / Cambiar credenciales" para reconectar.'
    : warning;
  const compactError = /unauthorized|401|forbidden|invalid token/i.test(String(error || ''))
    ? 'Sesión de Tiendanube vencida. Reconectá la integración para continuar.'
    : error;
  const orderedOrders = [...visibleOrders].sort((a, b) => {
    const dateA = new Date(a.createdAt || 0).getTime();
    const dateB = new Date(b.createdAt || 0).getTime();
    return dateB - dateA;
  });
  const allVisibleSelected = orderedOrders.length > 0 && orderedOrders.every((order) => selectedOrderIds.includes(order.id));
  const selectedVisibleCount = orderedOrders.filter((order) => selectedOrderIds.includes(order.id)).length;

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedOrderIds((prev) => prev.filter((id) => !orderedOrders.some((order) => order.id === id)));
      return;
    }

    setSelectedOrderIds((prev) => [...new Set([...prev, ...orderedOrders.map((order) => order.id)])]);
  };

  const updateDispatchStatus = async (status, ids = selectedOrderIds) => {
    const targetIds = [...new Set((Array.isArray(ids) ? ids : []).map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
    if (!targetIds.length) return;

    setUpdatingDispatchStatus(true);
    setUpdatingOrderIds((prev) => [...new Set([...prev, ...targetIds])]);
    setError('');
    setWarning('');
    try {
      const res = await fetch('/api/admin/tiendanube/dispatch-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: targetIds, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el estado de despacho');

      const updatedOrders = Array.isArray(data.orders) ? data.orders.filter(Boolean) : [];
      const updatedById = new Map(updatedOrders.map((order) => [order.id, order]));
      if (updatedById.size) {
        setOrders((prev) => prev.map((order) => updatedById.get(order.id) || order));
      }

      const failedIds = new Set((Array.isArray(data.failures) ? data.failures : []).map((item) => Number(item.id)).filter((id) => Number.isFinite(id)));
      setSelectedOrderIds((prev) => prev.filter((id) => !targetIds.includes(id) || failedIds.has(id)));

      if (data.failed) {
        const firstFailure = data.failures?.[0]?.error || 'Algunos pedidos no pudieron actualizarse en Tiendanube';
        if (data.updated) {
          setWarning(firstFailure);
          toast(`${data.updated} pedidos actualizados. ${data.failed} fallaron.`, 'info');
        } else {
          throw new Error(firstFailure);
        }
      } else {
        toast(
          status === 'dispatched'
            ? (targetIds.length === 1 ? 'Pedido marcado como despachado' : 'Pedidos marcados como despachados')
            : (targetIds.length === 1 ? 'Pedido marcado como por enviar' : 'Pedidos marcados como por enviar'),
          'success',
        );
      }
    } catch (err) {
      setError(err.message || 'Error inesperado');
      toast(err.message || 'No se pudo actualizar el estado de despacho', 'error');
    } finally {
      setUpdatingOrderIds((prev) => prev.filter((id) => !targetIds.includes(id)));
      setUpdatingDispatchStatus(false);
    }
  };

  const handleSearchSubmit = async () => {
    await load({ syncMode: '0', q: search });
  };

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Dashboard de envíos Tienda Nube</h2>
        <p className="section-subtitle">Pedidos de Tienda Nube que necesitan atención operativa inmediata.</p>
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
                Integración activa {connectedAt ? `· Conectado el ${formatDateTime(connectedAt)}` : ''}
                {lastSyncedAt ? ` · Última sync ${formatDateTime(lastSyncedAt)}` : ' · Sin sincronización previa'}
              </div>
              {canManageIntegration ? (
                <button type="button" className="btn btn-ghost" onClick={handleDisconnect} disabled={connecting}>
                  {connecting ? 'Procesando...' : 'Desconectar / Cambiar credenciales'}
                </button>
              ) : null}
            </div>
          </div>
          <div className="stats-grid" style={{ marginBottom: '16px' }}>
            <div className="stat-card card warning"><div className="stat-value">{toDispatchCount}</div><div className="stat-label">Por enviar</div></div>
            <div className="stat-card card success"><div className="stat-value">{dispatchedTodayCount}</div><div className="stat-label">Despachados hoy</div></div>
            <div className="stat-card card"><div className="stat-value" style={{ color: 'var(--text-secondary)' }}>{totalActiveCount}</div><div className="stat-label">Total activos</div></div>
          </div>

          <div className="card" style={{ marginBottom: '18px', padding: '14px' }}>
            <div className="form-row">
              <div className="form-group" style={{ minWidth: '280px' }}>
                <label className="form-label">Buscar</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    className="form-input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearchSubmit();
                      }
                    }}
                    placeholder="Número de pedido o cliente"
                  />
                  <button type="button" className="btn btn-ghost" onClick={handleSearchSubmit} disabled={loading || syncing}>
                    Buscar
                  </button>
                </div>
              </div>
              <div className="form-group" style={{ minWidth: '320px' }}>
                <label className="form-label">Vista</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setViewMode('all')}
                    style={{
                      background: viewMode === 'all' ? 'var(--surface-hover)' : 'transparent',
                      color: 'var(--text)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    Todo
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setViewMode('to_send')}
                    style={{
                      background: viewMode === 'to_send' ? 'rgba(249,115,22,0.12)' : 'transparent',
                      color: viewMode === 'to_send' ? '#f97316' : 'var(--text)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    Por enviar
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setViewMode('dispatched')}
                    style={{
                      background: viewMode === 'dispatched' ? 'rgba(34,197,94,0.12)' : 'transparent',
                      color: viewMode === 'dispatched' ? '#22c55e' : 'var(--text)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    Despachados
                  </button>
                </div>
              </div>
              <div className="form-group" style={{ maxWidth: '180px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => load({ syncMode: 'force' })} disabled={syncing}>
                  {syncing ? 'Sincronizando...' : 'Sincronizar'}
                </button>
              </div>
            </div>
          </div>

          {orderedOrders.length > 0 ? (
            <div className="card" style={{ marginBottom: '18px', padding: '14px 16px', background: 'var(--bg-secondary)' }}>
              <div className="flex-between" style={{ gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                  {selectedOrderIds.length > 0
                    ? `${selectedOrderIds.length} pedidos seleccionados${selectedVisibleCount > 0 ? ` · ${selectedVisibleCount} visibles en esta vista` : ''}`
                    : 'Seleccioná pedidos para marcarlos en batch'}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={toggleSelectAllVisible} disabled={updatingDispatchStatus}>
                    {allVisibleSelected ? 'Deseleccionar visibles' : 'Seleccionar visibles'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={!selectedOrderIds.length || updatingDispatchStatus}
                    onClick={() => updateDispatchStatus('dispatched', selectedOrderIds)}
                    style={{ background: 'var(--success-bg, rgba(34,197,94,0.12))', color: 'var(--success, #16a34a)', border: '1px solid var(--success, #16a34a)' }}
                  >
                    {updatingDispatchStatus ? 'Actualizando...' : 'Marcar despachados'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={!selectedOrderIds.length || updatingDispatchStatus}
                    onClick={() => updateDispatchStatus('to_send', selectedOrderIds)}
                    style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316', border: '1px solid #f97316' }}
                  >
                    Marcar por enviar
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {orderedOrders.length > 0 ? (
            <>
              <div className="table-container desktop-only">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '42px' }}>
                        <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} aria-label="Seleccionar pedidos visibles" />
                      </th>
                      <th>Pedido</th>
                      <th>Fecha</th>
                      <th>Cliente</th>
                      <th>Total</th>
                      <th>Productos</th>
                      <th>Envío</th>
                      <th>Estado</th>
                      <th style={{ width: '100px' }}>Detalle</th>
                      <th style={{ width: '140px' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderedOrders.map((order) => {
                      const operational = getOperationalStatus(order);
                      const productSummary = getProductSummary(order);
                      const isExpanded = expandedId === order.id;
                      const rowAction = getRowActionConfig(order);
                      const isUpdatingRow = updatingOrderIds.includes(order.id);

                      return [
                          <tr key={order.id}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedOrderIds.includes(order.id)}
                                onChange={() => toggleOrderSelection(order.id)}
                                aria-label={`Seleccionar pedido ${order.number || order.id}`}
                              />
                            </td>
                            <td>
                              <div style={{ fontWeight: 700, color: 'var(--text)' }}>#{order.number || order.id}</div>
                              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{order.contactEmail || '-'}</div>
                            </td>
                            <td>
                              <div style={{ color: 'var(--text)' }}>{formatOrderDate(order.createdAt)}</div>
                            </td>
                            <td>
                              <div style={{ color: 'var(--text)', fontWeight: 600 }}>{order.contactName || 'Sin nombre'}</div>
                            </td>
                            <td>
                              <div style={{ color: 'var(--text)', fontWeight: 700 }}>{formatOrderTotal(order.total, order.currency)}</div>
                            </td>
                            <td>
                              <div style={{ color: 'var(--accent)', fontWeight: 600 }}>{productSummary.label}</div>
                              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{productSummary.detail}</div>
                            </td>
                            <td>
                              <div style={{ color: 'var(--text)', fontWeight: 600 }}>{getShippingProviderLabel(order)}</div>
                              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                {order.shippingAddress?.city || order.shippingAddress?.province || 'Sin dirección'}
                              </div>
                            </td>
                            <td>
                              <span style={badgeStyle(operational.color)}>{operational.label}</span>
                            </td>
                            <td>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExpandedId(isExpanded ? null : order.id)}>
                                {isExpanded ? 'Ocultar' : 'Detalle'}
                              </button>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => updateDispatchStatus(rowAction.status, [order.id])}
                                disabled={isUpdatingRow || updatingDispatchStatus}
                                style={rowAction.style}
                              >
                                {isUpdatingRow ? 'Guardando...' : rowAction.label}
                              </button>
                            </td>
                          </tr>,
                          isExpanded ? (
                            <tr key={`${order.id}-detail`}>
                              <td colSpan={10} style={{ background: 'var(--bg-secondary)', padding: '16px 20px' }}>
                                <OrderDetails order={order} />
                              </td>
                            </tr>
                          ) : null,
                        ];
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mobile-only" style={{ display: 'grid', gap: '16px' }}>
                {orderedOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    isExpanded={expandedId === order.id}
                    selected={selectedOrderIds.includes(order.id)}
                    updating={updatingOrderIds.includes(order.id) || updatingDispatchStatus}
                    onAction={() => updateDispatchStatus(getRowActionConfig(order).status, [order.id])}
                    onSelectionToggle={() => toggleOrderSelection(order.id)}
                    onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="card">
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
                {viewMode === 'to_send'
                  ? 'No hay pedidos por enviar en este momento.'
                  : viewMode === 'dispatched'
                    ? 'No hay pedidos despachados para mostrar.'
                    : 'No hay pedidos por enviar o despachados para mostrar.'}
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
