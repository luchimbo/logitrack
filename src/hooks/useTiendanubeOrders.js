"use client";

import { useCallback, useEffect, useRef, useState } from "react";

let tiendanubeSectionCache = {
  orders: [],
  search: '',
  viewMode: 'to_send',
  connected: false,
  connectedAt: '',
  lastSyncedAt: '',
  connections: [],
  selectedConnectionId: '',
  initialized: false,
};

export function useTiendanubeOrders() {
  const [orders, setOrders] = useState(() => tiendanubeSectionCache.orders || []);
  const [search, setSearch] = useState(() => tiendanubeSectionCache.search || '');
  const [viewMode, setViewMode] = useState(() => tiendanubeSectionCache.viewMode || 'to_send');
  const [loading, setLoading] = useState(() => !tiendanubeSectionCache.initialized);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [connected, setConnected] = useState(() => Boolean(tiendanubeSectionCache.connected));
  const [connectedAt, setConnectedAt] = useState(() => tiendanubeSectionCache.connectedAt || '');
  const [lastSyncedAt, setLastSyncedAt] = useState(() => tiendanubeSectionCache.lastSyncedAt || '');
  const [connections, setConnections] = useState(() => tiendanubeSectionCache.connections || []);
  const [selectedConnectionId, setSelectedConnectionId] = useState(() => tiendanubeSectionCache.selectedConnectionId || '');
  const [connecting, setConnecting] = useState(false);
  const [verifyAfterOauth, setVerifyAfterOauth] = useState(false);
  const [pendingStoreId, setPendingStoreId] = useState('');
  const [hasLoadedOrders, setHasLoadedOrders] = useState(() => Boolean(tiendanubeSectionCache.initialized));
  const searchRef = useRef(search);
  const refreshInFlightRef = useRef(false);

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
      connections,
      selectedConnectionId,
      initialized: hasLoadedOrders,
    };
  }, [orders, search, viewMode, connected, connectedAt, lastSyncedAt, connections, selectedConnectionId, hasLoadedOrders]);

  const loadStatus = useCallback(async (retries = 5) => {
    try {
      const res = await fetch('/api/admin/tiendanube/status');
      const data = await res.json();
      if (res.ok) {
        setConnected(Boolean(data.connected));
        setConnectedAt(data.connectedAt || '');
        const nextConnections = Array.isArray(data.connections) ? data.connections : [];
        setConnections(nextConnections);
        setSelectedConnectionId((prev) => (
          prev && nextConnections.some((connection) => String(connection.id) === String(prev)) ? prev : ''
        ));
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

  const load = useCallback(async ({ syncMode = 'auto', q, silent = false } = {}) => {
    const showSyncing = syncMode === 'force';
    const showLoading = !showSyncing && !silent;

    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;

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
      if (selectedConnectionId) params.set('connection_id', selectedConnectionId);
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
      refreshInFlightRef.current = false;
      setLoading(false);
      setSyncing(false);
    }
  }, [selectedConnectionId]);

  const finishConnection = useCallback(async (storeId) => {
    try {
      const res = await fetch('/api/admin/tiendanube/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo finalizar la conexión');
      setWarning(data.webhookWarning || 'Integración con Tiendanube conectada correctamente. Los cambios nuevos van a entrar por webhook.');
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
    if (connected && !hasLoadedOrders) {
      load({ syncMode: '0' });
    }
  }, [connected, hasLoadedOrders, load]);

  useEffect(() => {
    if (!connected || !hasLoadedOrders) return undefined;

    const interval = setInterval(() => {
      load({ syncMode: '0', silent: true });
    }, 20000);

    return () => clearInterval(interval);
  }, [connected, hasLoadedOrders, load]);

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

  return {
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
  };
}
