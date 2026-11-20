const ORDER_TOPICS = new Set(['orders_v2', 'orders']);
const SHIPMENT_TOPICS = new Set(['shipments', 'flex-handshakes']);
const MAX_BODY_LENGTH = 8192;

export function mercadoLibreNotificationResource(topic, resource) {
  if (ORDER_TOPICS.has(topic)) {
    const orderId = resource.match(/^\/orders\/(\d{1,20})$/)?.[1];
    return orderId ? { orderId } : null;
  }
  if (SHIPMENT_TOPICS.has(topic)) {
    const shipmentId = resource.match(/^(?:\/flex\/sites\/[A-Z]{3})?\/shipments\/(\d{1,20})(?:\/assignment(?:\/v[12])?)?$/)?.[1];
    return shipmentId ? { shipmentId } : null;
  }
  return null;
}

export async function receiveMercadoLibreNotification(request, { applicationId, persist, defer, process }) {
  if (Number(request.headers.get('content-length')) > MAX_BODY_LENGTH) {
    return { status: 413, body: { error: 'Notificación demasiado grande' } };
  }

  let event;
  let payload;
  try {
    payload = await request.text();
    if (payload.length > MAX_BODY_LENGTH) return { status: 413, body: { error: 'Notificación demasiado grande' } };
    event = JSON.parse(payload);
  } catch {
    return { status: 400, body: { error: 'JSON inválido' } };
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return { status: 400, body: { error: 'Notificación inválida' } };
  }

  const topic = String(event.topic || '');
  const resource = String(event.resource || '');
  const userId = String(event.user_id || '');
  const senderAppId = String(event.application_id || '');
  if (!mercadoLibreNotificationResource(topic, resource) || !/^\d{1,20}$/.test(userId)) {
    return { status: 200, body: { received: true, ignored: 'notificación fuera de alcance' } };
  }
  if (!applicationId) return { status: 503, body: { received: false, error: 'Webhook no configurado' } };
  if (senderAppId !== applicationId) {
    return { status: 403, body: { received: false, error: 'Aplicación no autorizada' } };
  }

  let notification;
  try {
    const id = await persist({ topic, resource, userId, applicationId: senderAppId, payload });
    if (!id) throw new Error('Notificación sin identificador');
    notification = { id, topic, resource, userId };
  } catch (error) {
    console.error('Mercado Libre webhook: error al guardar el aviso', error?.code || error?.name);
    return { status: 503, body: { received: false, error: 'No se pudo guardar el aviso' } };
  }

  try {
    defer(() => process(notification));
  } catch (error) {
    // El aviso ya está guardado. La recuperación programada puede procesarlo.
    console.error('Mercado Libre webhook: error al programar el aviso', error?.name);
  }
  return { status: 200, body: { received: true, queued: true } };
}
