"use client";

import { useEffect, useState } from "react";
import { toast } from "@/lib/api";
import TiendanubeOrderCard from "@/components/tiendanube/TiendanubeOrderCard";
import TiendanubeOrderDetails from "@/components/tiendanube/TiendanubeOrderDetails";
import { useTiendanubeOrders } from "@/hooks/useTiendanubeOrders";
import {
  badgeStyle,
  formatDateTime,
  formatOrderDate,
  formatOrderTotal,
  getOperationalStatus,
  getProductSummary,
  getRowActionConfig,
  getShippingProviderLabel,
  isSameArgentinaDay,
} from "@/lib/tiendanubeOrderUtils";

export default function TiendanubeSection({ currentUser }) {
  const canManageIntegration = ['owner', 'admin'].includes(currentUser?.role);
  const {
    orders,
    setOrders,
    search,
    setSearch,
    viewMode,
    setViewMode,
    loading,
    syncing,
    error,
    setError,
    warning,
    setWarning,
    connected,
    connectedAt,
    lastSyncedAt,
    connections,
    selectedConnectionId,
    setSelectedConnectionId,
    connecting,
    verifyAfterOauth,
    pendingStoreId,
    setPendingStoreId,
    hasLoadedOrders,
    load,
    finishConnection,
    handleConnect,
    handleDisconnect,
  } = useTiendanubeOrders();
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [updatingOrderIds, setUpdatingOrderIds] = useState([]);
  const [updatingDispatchStatus, setUpdatingDispatchStatus] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!connected || !hasLoadedOrders) return;
    setSelectedOrderIds([]);
    load({ syncMode: '0' });
  }, [selectedConnectionId, connected, hasLoadedOrders, load]);

  useEffect(() => {
    setSelectedOrderIds((prev) => prev.filter((id) => orders.some((order) => order.id === id)));
  }, [orders]);

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
    if (connections.length > 1 && !selectedConnectionId) {
      const message = 'Seleccioná una tienda antes de actualizar estados en Tiendanube.';
      setError(message);
      toast(message, 'error');
      return;
    }

    setUpdatingDispatchStatus(true);
    setUpdatingOrderIds((prev) => [...new Set([...prev, ...targetIds])]);
    setError('');
    setWarning('');
    try {
      const res = await fetch('/api/admin/tiendanube/dispatch-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: targetIds, status, connectionId: selectedConnectionId }),
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
                  Iniciá sesión con tu cuenta de Tiendanube para recibir cambios de pedidos automáticamente.
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
                {lastSyncedAt ? ` · Última actualización ${formatDateTime(lastSyncedAt)}` : ' · Sin pedidos guardados todavía'}
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
              {connections.length > 1 ? (
                <div className="form-group" style={{ minWidth: '240px' }}>
                  <label className="form-label">Tienda</label>
                  <select
                    className="form-input"
                    value={selectedConnectionId}
                    onChange={(e) => setSelectedConnectionId(e.target.value)}
                  >
                    <option value="">Todas las tiendas</option>
                    {connections.map((connection) => (
                      <option key={connection.id} value={connection.id}>
                        {connection.displayName || connection.externalStoreId || `Tienda ${connection.id}`}
                      </option>
                    ))}
                  </select>
                  {!selectedConnectionId ? (
                    <div style={{ marginTop: '6px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      Para marcar despachos, seleccioná una tienda específica.
                    </div>
                  ) : null}
                </div>
              ) : null}
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
                  {syncing ? 'Sincronizando...' : 'Sincronizar manual'}
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
                                <TiendanubeOrderDetails order={order} />
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
                  <TiendanubeOrderCard
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
