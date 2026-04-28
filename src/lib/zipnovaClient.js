const ZIPNOVA_BASE_URL = process.env.ZIPNOVA_BASE_URL || 'https://api.zipnova.com.ar/v2';
const ZIPNOVA_API_TOKEN = process.env.ZIPNOVA_API_TOKEN || process.env.ZIPNOVA_KEY || '';
const ZIPNOVA_API_SECRET = process.env.ZIPNOVA_API_SECRET || process.env.ZIPNOVA_SECRET || '';

function getAuthHeader(token, secret) {
  if (!token || !secret) {
    throw new Error('ZIPNOVA_API_TOKEN o ZIPNOVA_API_SECRET no configurados');
  }
  const raw = `${token}:${secret}`;
  return `Basic ${Buffer.from(raw).toString('base64')}`;
}

export function createZipnovaClient({ token, secret, accessToken, baseUrl = ZIPNOVA_BASE_URL } = {}) {
  const resolvedToken = token;
  const resolvedSecret = secret;
  const resolvedAccessToken = accessToken;
  const resolvedBaseUrl = baseUrl || ZIPNOVA_BASE_URL;

  function getAuthorizationHeader() {
    if (resolvedAccessToken) {
      return `Bearer ${resolvedAccessToken}`;
    }
    return getAuthHeader(resolvedToken, resolvedSecret);
  }

  async function zipnovaFetch(path, options = {}) {
    const url = `${resolvedBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: getAuthorizationHeader(),
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
      throw new Error(data?.error || data?.message || `Zipnova error ${res.status}`);
    }

    return data;
  }

  async function listShipments({ page = 1, status = '', serviceType = '', orderId = '', externalId = '', from = '', to = '', originId = '' } = {}) {
    const params = new URLSearchParams();
    params.set('page', String(page || 1));
    if (status) params.set('status', status);
    if (serviceType) params.set('service_type', serviceType);
    if (orderId) params.set('order_id', orderId);
    if (externalId) params.set('external_id', externalId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (originId) params.set('origin_id', originId);

    return zipnovaFetch(`/shipments?${params.toString()}`);
  }

  async function listShipmentsByStatuses(statuses, options = {}) {
    const normalized = [...new Set((statuses || []).filter(Boolean))];
    const results = [];

    for (const status of normalized) {
      const response = await listShipments({ ...options, status });
      results.push({ status, response });
    }

    return results;
  }

  async function getShipment(id) {
    return zipnovaFetch(`/shipments/${id}`);
  }

  async function getShipmentDocumentation(id, { what = 'label', format = 'pdf', noStatusChange = true } = {}) {
    const normalizedWhat = what === 'document' ? 'document' : 'label';
    const normalizedFormat = format === 'zpl' ? 'zpl' : 'pdf';
    const params = new URLSearchParams();
    if (noStatusChange) params.set('no_status_change', '1');
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return zipnovaFetch(`/shipments/${id}/${normalizedWhat}.${normalizedFormat}${suffix}`);
  }

  async function listAddresses({ accountId = '', page = 1 } = {}) {
    const params = new URLSearchParams();
    params.set('page', String(page || 1));
    if (accountId) params.set('account_id', accountId);
    return zipnovaFetch(`/addresses?${params.toString()}`);
  }

  return {
    listShipments,
    listShipmentsByStatuses,
    getShipment,
    getShipmentDocumentation,
    listAddresses,
  };
}

export function getDefaultZipnovaClient() {
  return createZipnovaClient({ token: ZIPNOVA_API_TOKEN, secret: ZIPNOVA_API_SECRET });
}

// Legacy exports for backward compatibility (uses default client)
const defaultClient = getDefaultZipnovaClient();

export async function listZipnovaShipments(options) {
  return defaultClient.listShipments(options);
}

export async function listZipnovaShipmentsByStatuses(statuses, options) {
  return defaultClient.listShipmentsByStatuses(statuses, options);
}

export async function getZipnovaShipment(id) {
  return defaultClient.getShipment(id);
}

export async function getZipnovaShipmentDocumentation(id, options) {
  return defaultClient.getShipmentDocumentation(id, options);
}

export async function listZipnovaAddresses(options) {
  return defaultClient.listAddresses(options);
}

function extractZipnovaProducts(shipment) {
  const packages = Array.isArray(shipment?.packages) ? shipment.packages : [];
  return packages.map((pkg, index) => ({
    index,
    sku: pkg?.description_1 || null,
    name: pkg?.description_2 || pkg?.description_1 || 'Producto sin descripción',
    extra: pkg?.description_3 || null,
    quantity: 1,
    weight: pkg?.weight || 0,
  }));
}

export function normalizeZipnovaShipment(shipment) {
  const destination = shipment?.destination || {};
  const origin = shipment?.origin || {};
  const carrier = shipment?.carrier || shipment?.selected_rate?.carrier || null;
  const products = extractZipnovaProducts(shipment);

  return {
    id: shipment?.id,
    account_id: shipment?.account_id,
    external_id: shipment?.external_id,
    delivery_id: shipment?.delivery_id,
    created_at: shipment?.created_at,
    delivery_time: shipment?.delivery_time || null,
    status: shipment?.status,
    status_name: shipment?.status_name,
    logistic_type: shipment?.logistic_type,
    service_type: shipment?.service_type,
    tracking: shipment?.tracking,
    tracking_external: shipment?.tracking_external,
    recipient_name: destination?.name || null,
    recipient_email: destination?.email || null,
    recipient_phone: destination?.phone || null,
    address: [destination?.street, destination?.street_number, destination?.street_extras].filter(Boolean).join(' ').trim() || null,
    city: destination?.city || null,
    province: destination?.state || null,
    postal_code: destination?.zipcode || null,
    origin_id: origin?.id || shipment?.origin_id || null,
    origin_name: origin?.name || null,
    origin_address: [origin?.street, origin?.street_number, origin?.street_extras].filter(Boolean).join(' ').trim() || null,
    origin_city: origin?.city || null,
    origin_province: origin?.state || null,
    total_packages: shipment?.total_packages || 0,
    total_weight: shipment?.total_weight || 0,
    total_volume: shipment?.total_volume || 0,
    declared_value: shipment?.declared_value || 0,
    price: shipment?.price_incl_tax || shipment?.price || 0,
    carrier_name: carrier?.name || null,
    carrier_logo: carrier?.logo || null,
    products,
    packages: Array.isArray(shipment?.packages) ? shipment.packages : [],
  };
}

export function isZipnovaToday(value) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const today = formatter.format(new Date());
  return formatter.format(date) === today;
}
