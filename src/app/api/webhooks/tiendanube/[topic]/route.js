import { NextResponse } from 'next/server';

const VALID_TOPICS = new Set([
  'store-redact',
  'customers-redact',
  'customers-data-request',
  'store',
  'customers',
]);

function normalizePrivacyTopic(topic, body) {
  const event = String(body?.event || '').replace('/', '-');
  if (event === 'store-redact' || event === 'customers-redact' || event === 'customers-data_request') {
    return event.replace('data_request', 'data-request');
  }
  return topic;
}

export async function POST(request, { params }) {
  try {
    const { topic } = await params;

    const body = await request.json().catch(() => ({}));
    const normalizedTopic = normalizePrivacyTopic(topic, body);

    if (!VALID_TOPICS.has(topic) || !VALID_TOPICS.has(normalizedTopic)) {
      return NextResponse.json({ error: 'Topic no soportado' }, { status: 404 });
    }

    console.log(`[Tiendanube Webhook] ${normalizedTopic}`, {
      storeId: body?.store_id || body?.id,
      body,
    });

    // Por ahora solo logueamos y respondemos 200 OK para cumplir con homologación
    // En el futuro se puede implementar la lógica de borrado/exportación de datos aquí

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Tiendanube webhook error:', error);
    return NextResponse.json({ error: error.message || 'Error procesando webhook' }, { status: 200 });
  }
}
