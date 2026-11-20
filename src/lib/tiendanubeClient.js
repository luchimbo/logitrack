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
      const error = new Error(`Tiendanube rechazó el acceso (store ${resolvedStoreId}, HTTP ${lastRes.status}): verificá el token y los permisos de la app`);
      error.status = lastRes.status;
      throw error;
    }

    const error = new Error(lastData?.message || (typeof lastData?.error === 'string' ? lastData.error : '') || `Tiendanube error ${lastRes?.status || 'desconocido'}`);
    error.status = lastRes?.status;
    error.description = lastData?.description;
    throw error;
  }

  async function listOrders({ page = 1, perPage = 50, status = '', paymentStatus = '', shippingStatus = '', createdAtMin = '', createdAtMax = '', updatedAtMin = '', updatedAtMax = '', fields = '', q = '' } = {}) {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('per_page', String(perPage));
    if (status) params.set('status', status);
    if (paymentStatus) params.set('payment_status', paymentStatus);
    if (shippingStatus) params.set('shipping_status', shippingStatus);
    if (createdAtMin) params.set('created_at_min', createdAtMin);
    if (createdAtMax) params.set('created_at_max', createdAtMax);
    if (updatedAtMin) params.set('updated_at_min', updatedAtMin);
    if (updatedAtMax) params.set('updated_at_max', updatedAtMax);
    if (fields) params.set('fields', fields);
    if (q) params.set('q', q);

    try {
      const payload = await tiendanubeFetch(`/orders?${params.toString()}`);
      return normalizeOrdersResponse(payload);
    } catch (error) {
      // TN returns 404 for an empty collection or a page beyond its last page.
      // Keep missing routes, stores and authorization errors visible.
      if (error.status === 404 && /last page is \d+/i.test(error.description || '')) return [];
      throw error;
    }
  }

  async function getOrder(id) {
    return tiendanubeFetch(`/orders/${id}`);
  }

  async function getStore() {
    return tiendanubeFetch('/store');
  }

  async function listProducts({ page = 1, perPage = 200 } = {}) {
    const payload = await tiendanubeFetch(`/products?page=${page}&per_page=${perPage}`);
    if (!Array.isArray(payload)) throw new Error('Respuesta de catálogo Tiendanube inválida');
    return payload;
  }

  async function downloadCatalog() {
    const products = [];
    for (let page = 1; page <= 200; page++) {
      const batch = await listProducts({ page });
      products.push(...batch);
      if (batch.length < 200) return products;
    }
    throw new Error('Catálogo incompleto: se alcanzó el límite de páginas');
  }

  async function listPromotions() {
    const payload = await tiendanubeFetch('/promotions');
    const promotions = Array.isArray(payload) ? payload : payload?.data;
    if (!Array.isArray(promotions)) throw new Error('Respuesta de promociones Tiendanube inválida');
    return promotions;
  }

  async function createPromotion(promotion) {
    return tiendanubeFetch('/promotions', { method: 'POST', body: JSON.stringify(promotion) });
  }

  async function updatePromotion(id, changes) {
    return tiendanubeFetch(`/promotions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(changes) });
  }

  async function deletePromotion(id) {
    return tiendanubeFetch(`/promotions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async function setDiscountCallback(url) {
    if (new URL(url).protocol !== 'https:') throw new Error('El callback de descuentos requiere HTTPS');
    return tiendanubeFetch('/discounts/callbacks', { method: 'PUT', body: JSON.stringify({ url }) });
  }

  // Asociación tienda-script. El script se crea en Partners sin instalación automática.
  async function listScripts() {
    const payload = await tiendanubeFetch('/scripts');
    const scripts = Array.isArray(payload) ? payload : [payload?.result, payload?.data, payload?.results, payload?.scripts].find(Array.isArray);
    // Mostrar sólo los nombres de los campos para diagnosticar un formato nuevo.
    if (!scripts) throw new Error(`Respuesta de scripts Tiendanube inválida (${Object.keys(payload || {}).join(', ') || typeof payload})`);
    return scripts;
  }

  async function createScriptAssociation(scriptId, queryParams = {}) {
    return tiendanubeFetch('/scripts', { method: 'POST', body: JSON.stringify({ script_id: scriptId, query_params: JSON.stringify(queryParams) }) });
  }

  async function deleteScriptAssociation(id) {
    return tiendanubeFetch(`/scripts/${encodeURIComponent(id)}`, { method: 'DELETE' });
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
    getStore,
    listProducts,
    downloadCatalog,
    listPromotions,
    createPromotion,
    updatePromotion,
    deletePromotion,
    setDiscountCallback,
    listScripts,
    createScriptAssociation,
    deleteScriptAssociation,
    listWebhooks,
    createWebhook,
    listFulfillmentOrders,
    updateFulfillmentOrderStatus,
  };
}
