const TIENDANUBE_API_BASE = 'https://api.tiendanube.com/v1';

export function createTiendanubeClient({ accessToken, storeId } = {}) {
  const resolvedAccessToken = accessToken;
  const resolvedStoreId = String(storeId || '');

  async function tiendanubeFetch(path, options = {}) {
    if (!resolvedAccessToken || !resolvedStoreId) {
      throw new Error('Access token o store ID de Tiendanube no configurados');
    }
    const url = `${TIENDANUBE_API_BASE}/${resolvedStoreId}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        Authentication: `bearer ${resolvedAccessToken}`,
        'User-Agent': 'GeoModi (support@geomodi.ai)',
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      cache: 'no-store',
    });

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      throw new Error(data?.error || data?.message || `Tiendanube error ${res.status}`);
    }

    return data;
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

    return tiendanubeFetch(`/orders?${params.toString()}`);
  }

  async function getOrder(id) {
    return tiendanubeFetch(`/orders/${id}`);
  }

  return {
    listOrders,
    getOrder,
  };
}
