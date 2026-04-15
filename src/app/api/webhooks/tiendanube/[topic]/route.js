import { NextResponse } from 'next/server';

const VALID_TOPICS = new Set([
  'store-redact',
  'customers-redact',
  'customers-data-request',
]);

export async function POST(request, { params }) {
  try {
    const { topic } = await params;

    if (!VALID_TOPICS.has(topic)) {
      return NextResponse.json({ error: 'Topic no soportado' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));

    console.log(`[Tiendanube Webhook] ${topic}`, {
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
