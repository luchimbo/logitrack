import crypto from 'node:crypto';

// Sin secreto no hay forma de distinguir a Tiendanube de cualquier otro emisor:
// se rechaza en lugar de aceptar todo (un entorno mal configurado no debe abrir la puerta).
export function verifyTiendanubeWebhookSignature(rawBody, signature, secret) {
  if (!secret) return false;
  const received = String(signature || '').trim();
  if (!received) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody || '').digest('hex');
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export const TIENDANUBE_SIGNATURE_HEADER = 'x-linkedstore-hmac-sha256';

let warnedMissingSecret = false;
export function warnIfTiendanubeSecretMissing(secret) {
  if (secret || warnedMissingSecret) return;
  warnedMissingSecret = true;
  console.error('[Tiendanube Webhook] TIENDANUBE_CLIENT_SECRET no está configurado: se rechazan todos los webhooks.');
}

const PRIVACY_TOPICS = new Set(['store-redact', 'customers-redact', 'customers-data-request']);

export function normalizeTiendanubePrivacyTopic(topic, body) {
  const event = String(body?.event || '').replace('/', '-').replace('data_request', 'data-request');
  if (PRIVACY_TOPICS.has(event)) return event;
  const fromPath = String(topic || '');
  if (PRIVACY_TOPICS.has(fromPath)) return fromPath;
  if (fromPath === 'store') return 'store-redact';
  return fromPath;
}

function toIdList(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter((value) => /^\d+$/.test(value)))];
}

// Procesa los webhooks obligatorios de privacidad (LGPD) de Tiendanube.
// Las operaciones de base se inyectan para poder probarlo sin base real.
export async function handleTiendanubePrivacyWebhook({ topic, rawBody, signature, secret }, handlers) {
  if (!verifyTiendanubeWebhookSignature(rawBody, signature, secret)) {
    return { status: 401, body: { error: 'Firma inválida' } };
  }

  let body;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return { status: 400, body: { error: 'JSON inválido' } };
  }

  const normalizedTopic = normalizeTiendanubePrivacyTopic(topic, body);
  if (!PRIVACY_TOPICS.has(normalizedTopic)) {
    return { status: 404, body: { error: 'Topic no soportado' } };
  }

  const storeId = String(body?.store_id || '').trim();
  if (!/^\d+$/.test(storeId)) {
    return { status: 200, body: { received: true, ignored: 'sin store_id' } };
  }

  // Nunca loguear el cuerpo: trae email, teléfono y documento del cliente.
  handlers.log?.(normalizedTopic, { storeId });

  if (normalizedTopic === 'store-redact') {
    const result = await handlers.redactStore({ storeId });
    return { status: 200, body: { received: true, redacted: result?.deleted ?? 0 } };
  }

  if (normalizedTopic === 'customers-redact') {
    const orderIds = toIdList(body?.orders_to_redact);
    const email = String(body?.customer?.email || '').trim().toLowerCase();
    if (!orderIds.length && !email) {
      return { status: 200, body: { received: true, redacted: 0 } };
    }
    const result = await handlers.redactCustomer({ storeId, orderIds, email });
    return { status: 200, body: { received: true, redacted: result?.anonymized ?? 0 } };
  }

  // customers/data_request: el comercio responde al cliente; acá solo se registra el pedido.
  const orderIds = toIdList(body?.orders_requested);
  await handlers.recordDataRequest?.({
    storeId,
    customerId: String(body?.customer?.id || ''),
    requestId: String(body?.data_request?.id || ''),
    orderIds,
  });
  return { status: 200, body: { received: true } };
}
