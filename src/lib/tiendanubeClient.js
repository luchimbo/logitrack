const TIENDANUBE_API_BASE_V1 = 'https://api.tiendanube.com/v1';
const TIENDANUBE_API_BASE_2025_03 = 'https://api.tiendanube.com/2025-03';

function normalizeOrdersResponse(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.orders)) return payload.orders;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

export function createTiendanubeClient({ accessToken, storeId } = {}) {
  const resolvedAccessToken = accessToken;
  const resolvedStoreId = String(storeId || '');

  function buildHeaders(mode, extraHeaders = {}) {
    const base = {
      'User-Agent': 'GeoModi (support@geomodi.ai)',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...extraHeaders,
    };

    if (mode === 'authentication-only') {
      return {
        ...base,
        Authentication: `bearer ${resolvedAccessToken}`,
      };
    }

    if (mode === 'authorization-only') {
      return {
        ...base,
        Authorization: `Bearer ${resolvedAccessToken}`,
      };
    }

    return {
      ...base,
      Authentication: `bearer ${resolvedAccessToken}`,
      Authorization: `Bearer ${resolvedAccessToken}`,
    };
  }

  async function parseResponse(res) {
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    return data;
  }

  function shouldRetryAuth(res, data) {
    if (res.status === 401 || res.status === 403) return true;
    const msg = String(data?.error || data?.message || '').toLowerCase();
    return msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('token');
  }

  async function tiendanubeFetch(path, options = {}, { apiBase = TIENDANUBE_API_BASE_V1 } = {}) {
    if (!resolvedAccessToken || !resolvedStoreId) {
      throw new Error('Access token o store ID de Tiendanube no configurados');
    }
    const url = `${apiBase}/${resolvedStoreId}${path.startsWith('/') ? path : `/${path}`}`;
    const modes = ['authentication-only', 'authorization-only', 'both'];
    let lastRes = null;
    let lastData = null;

    for (const mode of modes) {
      const res = await fetch(url, {
        ...options,
        headers: buildHeaders(mode, options.headers || {}),
        cache: 'no-store',
      });

      const data = await parseResponse(res);
      if (res.ok) {
        return data;
      }

      lastRes = res;
      lastData = data;
      if (!shouldRetryAuth(res, data)) {
        break;
      }
    }

    if (lastRes?.status === 401 || lastRes?.status === 403) {
      throw new Error(`Unauthorized en Tiendanube (store ${resolvedStoreId}): token inválido/vencido o permisos insuficientes (read_orders)`);
    }

    throw new Error(lastData?.error || lastData?.message || `Tiendanube error ${lastRes?.status || 'desconocido'}`);
  }

  async function listOrders({ page = 1, perPage = 50, status = '', paymentStatus = '', shippingStatus = '', createdAtMin = '', createdAtMax = '', q = '' } = {}) {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('per_page', String(perPage));
    if (status) params.set('status', status);
    if (paymentStatus) params.set('payment_status', paymentStatus);
    if (shippingStatus) params.set('shipping_status', shippingStatus);
    if (createdAtMin) params.set('created_at_min', createdAtMin);
    if (createdAtMax) params.set('created_at_max', createdAtMax);
    if (q) params.set('q', q);

    const payload = await tiendanubeFetch(`/orders?${params.toString()}`);
    return normalizeOrdersResponse(payload);
  }

  async function getOrder(id) {
    return tiendanubeFetch(`/orders/${id}`);
  }

  async function listWebhooks() {
    const payload = await tiendanubeFetch('/webhooks', {}, { apiBase: TIENDANUBE_API_BASE_2025_03 });
    return Array.isArray(payload) ? payload : [];
  }

  async function createWebhook({ event, url } = {}) {
    return tiendanubeFetch('/webhooks', {
      method: 'POST',
      body: JSON.stringify({ event, url }),
    }, { apiBase: TIENDANUBE_API_BASE_2025_03 });
  }

  async function listFulfillmentOrders(orderId) {
    const payload = await tiendanubeFetch(`/orders/${orderId}/fulfillment-orders`, {}, { apiBase: TIENDANUBE_API_BASE_2025_03 });
    return Array.isArray(payload) ? payload : [];
  }

  async function updateFulfillmentOrderStatus(orderId, fulfillmentOrderId, status) {
    return tiendanubeFetch(
      `/orders/${orderId}/fulfillment-orders/${fulfillmentOrderId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      },
      { apiBase: TIENDANUBE_API_BASE_2025_03 },
    );
  }

  return {
    listOrders,
    getOrder,
    listWebhooks,
    createWebhook,
    listFulfillmentOrders,
    updateFulfillmentOrderStatus,
  };
}
