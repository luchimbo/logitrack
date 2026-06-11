const MELI_API_BASE = 'https://api.mercadolibre.com';

export function createMercadoLibreClient({ accessToken } = {}) {
  async function request(path, options = {}) {
    if (!accessToken) throw new Error('Access token de Mercado Libre no configurado');
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...options.headers,
    };
    const res = await fetch(`${MELI_API_BASE}${path}`, { ...options, headers, cache: 'no-store' });
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (!res.ok) {
      const data = isJson ? await res.json().catch(() => ({})) : { message: await res.text().catch(() => '') };
      throw new Error(data.error_description || data.message || data.error || `Mercado Libre error ${res.status}`);
    }

    if (options.responseType === 'arrayBuffer') {
      return res.arrayBuffer();
    }
    return isJson ? res.json() : res.text();
  }

  async function getMe() {
    return request('/users/me');
  }

  async function searchOrders({ sellerId, offset = 0, limit = 50, q = '', dateFrom = '', dateTo = '' } = {}) {
    const params = new URLSearchParams({ seller: String(sellerId), 'order.status': 'paid', sort: 'date_desc', offset: String(offset), limit: String(limit) });
    if (q) params.set('q', q);
    if (dateFrom) params.set('order.date_created.from', dateFrom);
    if (dateTo) params.set('order.date_created.to', dateTo);
    return request(`/orders/search?${params.toString()}`);
  }

  function getOrder(orderId) {
    return request(`/orders/${orderId}`);
  }

  function getShipment(shipmentId) {
    return request(`/shipments/${shipmentId}`, { headers: { 'x-format-new': 'true' } });
  }

  function getShipmentItems(shipmentId) {
    return request(`/shipments/${shipmentId}/items`);
  }

  function getShipmentLeadTime(shipmentId) {
    return request(`/shipments/${shipmentId}/lead_time`);
  }

  async function getShipmentDelays(shipmentId) {
    try {
      return await request(`/shipments/${shipmentId}/delays`);
    } catch (error) {
      const message = String(error.message || '').toLowerCase();
      if (message.includes('not found') || message.includes('doesnt have any delay') || message.includes("doesn't have any delay")) return null;
      throw error;
    }
  }

  async function getShipmentCarrier(shipmentId) {
    try {
      return await request(`/shipments/${shipmentId}/carrier`);
    } catch {
      return null;
    }
  }

  async function getShipmentHistory(shipmentId) {
    try {
      return await request(`/shipments/${shipmentId}/history`);
    } catch {
      return [];
    }
  }

  function downloadShipmentLabelsZpl(shipmentIds) {
    const ids = Array.isArray(shipmentIds) ? shipmentIds.join(',') : String(shipmentIds || '');
    return request(`/shipment_labels?shipment_ids=${encodeURIComponent(ids)}&response_type=zpl2`, { responseType: 'arrayBuffer' });
  }

  function downloadShipmentLabelsPdf(shipmentIds) {
    const ids = Array.isArray(shipmentIds) ? shipmentIds.join(',') : String(shipmentIds || '');
    return request(`/shipment_labels?shipment_ids=${encodeURIComponent(ids)}&response_type=pdf`, { responseType: 'arrayBuffer' });
  }

  async function downloadShipmentLabelsZplBatches(shipmentIds, chunkSize = 50) {
    const ids = Array.isArray(shipmentIds)
      ? [...new Set(shipmentIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : [];
    const batches = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const buffer = await downloadShipmentLabelsZpl(chunk);
      batches.push({ shipmentIds: chunk, buffer });
    }
    return batches;
  }

  async function getFlexAssignment({ siteId, shipmentId }) {
    try {
      return await request(`/flex/sites/${siteId}/shipments/${shipmentId}/assignment/v1`);
    } catch {
      return null;
    }
  }

  async function getFlexSubscriptions({ siteId, userId }) {
    try {
      return await request(`/shipping/flex/sites/${siteId}/users/${userId}/subscriptions/v1`);
    } catch {
      return null;
    }
  }

  async function getFlexConfiguration({ siteId, userId, serviceId }) {
    if (!siteId || !userId || !serviceId) return null;
    const query = `{
      configuration (user_id: ${Number(userId)}, service_id: ${Number(serviceId)}) {
        delivery_window
        delivery_ranges
        zones
        disabled_features
      }
    }`;
    try {
      return await request(`/shipping/flex/sites/${siteId}/configuration/v3`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
    } catch {
      return null;
    }
  }

  async function getFlexConfigurationForUser({ siteId, userId }) {
    const subscriptions = await getFlexSubscriptions({ siteId, userId });
    const list = Array.isArray(subscriptions)
      ? subscriptions
      : Array.isArray(subscriptions?.subscriptions)
        ? subscriptions.subscriptions
        : [];
    const active = list.find((item) => item?.service_id || item?.serviceId) || list[0];
    const serviceId = active?.service_id || active?.serviceId;
    if (!serviceId) return null;
    return getFlexConfiguration({ siteId, userId, serviceId });
  }

  return {
    getMe,
    searchOrders,
    getOrder,
    getShipment,
    getShipmentItems,
    getShipmentLeadTime,
    getShipmentDelays,
    getShipmentCarrier,
    getShipmentHistory,
    downloadShipmentLabelsZpl,
    downloadShipmentLabelsPdf,
    downloadShipmentLabelsZplBatches,
    getFlexAssignment,
    getFlexSubscriptions,
    getFlexConfiguration,
    getFlexConfigurationForUser,
  };
}
