const CORREO_ARGENTINO_BASE_URL = process.env.CORREO_ARGENTINO_BASE_URL || 'https://apitest.correoargentino.com.ar/paqar/v1';

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizePath(path) {
  return path.startsWith('/') ? path : `/${path}`;
}

function extractError(data, status) {
  if (!data) return `Correo Argentino error ${status}`;
  return data.error || data.message || data.descripcion || data.description || data.raw || `Correo Argentino error ${status}`;
}

function getAuthHeaders({ apiKey, agreement } = {}) {
  const headers = {};
  if (apiKey) headers.Authorization = `Apikey ${apiKey}`;
  if (agreement) headers.agreement = agreement;
  return headers;
}

export function createCorreoArgentinoClient({ apiKey, agreement, sellerId, baseUrl = CORREO_ARGENTINO_BASE_URL } = {}) {
  const credentials = {
    apiKey: String(apiKey || '').trim(),
    agreement: String(agreement || '').trim(),
    sellerId: String(sellerId || agreement || '').trim(),
  };
  const resolvedBaseUrl = trimTrailingSlash(baseUrl || CORREO_ARGENTINO_BASE_URL);

  async function correoFetch(path, options = {}) {
    const url = `${resolvedBaseUrl}${normalizePath(path)}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...getAuthHeaders(credentials),
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
      throw new Error(extractError(data, res.status));
    }

    return data;
  }

  function withSellerDefaults(payload = {}) {
    return {
      ...(credentials.sellerId && !payload.sellerId ? { sellerId: credentials.sellerId } : {}),
      ...payload,
    };
  }

  async function validateCredentials() {
    return correoFetch('/auth', { method: 'GET' });
  }

  async function listAgencies(params = {}) {
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        search.set(key, String(value));
      }
    });
    const suffix = search.toString() ? `?${search.toString()}` : '';
    return correoFetch(`/agencies${suffix}`);
  }

  async function createOrder(payload = {}) {
    return correoFetch('/orders', {
      method: 'POST',
      body: JSON.stringify(withSellerDefaults(payload)),
    });
  }

  async function cancelOrder(trackingNumber) {
    return correoFetch(`/orders/${encodeURIComponent(trackingNumber)}/cancel`, { method: 'PATCH' });
  }

  async function getLabels(orders = [], { labelFormat = '10x15' } = {}) {
    const search = new URLSearchParams();
    if (labelFormat) search.set('labelFormat', labelFormat);
    const payload = (Array.isArray(orders) ? orders : [orders]).map((order) => withSellerDefaults(order));
    return correoFetch(`/labels?${search.toString()}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async function getTracking(trackingNumbers, { extClient = '' } = {}) {
    const search = new URLSearchParams();
    if (extClient) search.set('extClient', extClient);
    const normalized = (Array.isArray(trackingNumbers) ? trackingNumbers : [trackingNumbers])
      .map((trackingNumber) => String(trackingNumber || '').trim())
      .filter(Boolean);
    normalized.forEach((trackingNumber) => search.append('trackingNumber', trackingNumber));
    return correoFetch(`/tracking?${search.toString()}`);
  }

  return {
    validateCredentials,
    listAgencies,
    createOrder,
    cancelOrder,
    getLabels,
    getTracking,
  };
}

export function getDefaultCorreoArgentinoClient() {
  return createCorreoArgentinoClient({
    apiKey: process.env.CORREO_ARGENTINO_API_KEY,
    agreement: process.env.CORREO_ARGENTINO_AGREEMENT,
    sellerId: process.env.CORREO_ARGENTINO_SELLER_ID,
    baseUrl: process.env.CORREO_ARGENTINO_BASE_URL,
  });
}

export function extractCorreoTracking(response) {
  return response?.trackingNumber || response?.tracking_number || response?.tracking || response?.numeroSeguimiento || response?.nroSeguimiento || response?.codigoSeguimiento || null;
}

export function extractCorreoShipmentId(response) {
  return response?.id || response?.idSeller || response?.shippingId || response?.shipping_id || response?.shipmentId || response?.envioId || response?.numeroEnvio || null;
}

export function extractCorreoLabel(response) {
  return response?.fileBase64 || response?.label || response?.labelBase64 || response?.label_base64 || response?.etiqueta || response?.etiquetaBase64 || response?.pdf || null;
}
