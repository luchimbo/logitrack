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

export function createZipnovaClient({ token, secret, baseUrl = ZIPNOVA_BASE_URL } = {}) {
  const resolvedToken = token;
  const resolvedSecret = secret;
  const resolvedBaseUrl = baseUrl || ZIPNOVA_BASE_URL;

  async function zipnovaFetch(path, options = {}) {
    const url = `${resolvedBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: getAuthHeader(resolvedToken, resolvedSecret),
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

  async function listShipments({ page = 1, status = '', serviceType = '', orderId = '', externalId = '' } = {}) {
    const params = new URLSearchParams();
    params.set('page', String(page || 1));
    if (status) params.set('status', status);
    if (serviceType) params.set('service_type', serviceType);
    if (orderId) params.set('order_id', orderId);
    if (externalId) params.set('external_id', externalId);

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

  async function getShipmentDocumentation(id, { what = 'label', format = 'pdf' } = {}) {
    const params = new URLSearchParams({ what, format });
    return zipnovaFetch(`/shipments/${id}/documentation?${params.toString()}`);
  }

  return {
    listShipments,
    listShipmentsByStatuses,
    getShipment,
    getShipmentDocumentation,
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
  const carrier = shipment?.carrier || shipment?.selected_rate?.carrier || null;
  const products = extractZipnovaProducts(shipment);

  return {
    id: shipment?.id,
    external_id: shipment?.external_id,
    delivery_id: shipment?.delivery_id,
    created_at: shipment?.created_at,
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
    total_packages: shipment?.total_packages || 0,
    total_weight: shipment?.total_weight || 0,
    declared_value: shipment?.declared_value || 0,
    price: shipment?.price_incl_tax || shipment?.price || 0,
    carrier_name: carrier?.name || null,
    carrier_logo: carrier?.logo || null,
    products,
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
