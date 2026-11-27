import { NextResponse } from 'next/server';
import { logAudit } from '@/lib/audit';
import { redactTiendanubeCustomerOrders, redactTiendanubeStoreOrders } from '@/lib/tiendanubeStore';
import {
  TIENDANUBE_SIGNATURE_HEADER,
  handleTiendanubePrivacyWebhook,
  warnIfTiendanubeSecretMissing,
} from '@/lib/tiendanubeWebhookSecurity';

const TIENDANUBE_CLIENT_SECRET = process.env.TIENDANUBE_CLIENT_SECRET || '';

function auditPrivacy(action, metadata) {
  return logAudit({ actorType: 'system', actorLabel: 'tiendanube', action, entityType: 'tiendanube_store', entityId: metadata.storeId, metadata });
}

export async function POST(request, { params }) {
  try {
    const { topic } = await params;
    warnIfTiendanubeSecretMissing(TIENDANUBE_CLIENT_SECRET);

    const result = await handleTiendanubePrivacyWebhook({
      topic,
      rawBody: await request.text(),
      signature: request.headers.get(TIENDANUBE_SIGNATURE_HEADER) || '',
      secret: TIENDANUBE_CLIENT_SECRET,
    }, {
      log: (normalizedTopic, { storeId }) => console.log(`[Tiendanube Webhook] ${normalizedTopic}`, { storeId }),
      redactStore: async ({ storeId }) => {
        const outcome = await redactTiendanubeStoreOrders({ storeId });
        await auditPrivacy('tiendanube.privacy.store_redact', { storeId, deleted: outcome.deleted });
        return outcome;
      },
      redactCustomer: async ({ storeId, orderIds, email }) => {
        const outcome = await redactTiendanubeCustomerOrders({ storeId, orderIds, email });
        await auditPrivacy('tiendanube.privacy.customer_redact', { storeId, orders: orderIds.length, anonymized: outcome.anonymized });
        return outcome;
      },
      recordDataRequest: ({ storeId, customerId, requestId, orderIds }) => auditPrivacy(
        'tiendanube.privacy.data_request',
        { storeId, customerId, requestId, orderIds },
      ),
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    // 500 para que Tiendanube reintente: un borrado pendiente no debe darse por cumplido.
    console.error('Tiendanube privacy webhook error:', error?.message || error);
    return NextResponse.json({ error: 'Error procesando webhook' }, { status: 500 });
  }
}
