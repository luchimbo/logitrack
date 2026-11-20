import { after, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { receiveMercadoLibreNotification } from '@/lib/mercadolibreWebhook';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function insertNotification({ topic, resource, userId, applicationId, payload }) {
  return db.execute({
    sql: `INSERT INTO mercadolibre_notifications (topic, resource, user_id, application_id, payload_json)
          VALUES (?, ?, ?, ?, ?)`,
    args: [topic, resource, userId, applicationId, payload],
  });
}

async function persist(notification) {
  let result;
  try {
    result = await insertNotification(notification);
  } catch (error) {
    // La tabla ya existe en producción. Inicializar solo en una instalación nueva.
    if (!/no such table: mercadolibre_notifications/i.test(error?.message || '')) throw error;
    const { ensureDb } = await import('@/lib/ensureDb');
    await ensureDb();
    result = await insertNotification(notification);
  }
  return result.lastInsertRowid;
}

async function processInBackground(notification) {
  try {
    const { findIntegrationConnectionByStore } = await import('@/lib/integrationService');
    const { listMercadoLibreClientTargets } = await import('@/lib/mercadolibreResolver');
    const { processMercadoLibreNotification } = await import('@/lib/financeReconciliation');
    const connection = await findIntegrationConnectionByStore({
      provider: 'mercadolibre', externalStoreId: notification.userId, includeConfig: false,
    });
    if (!connection?.isActive) return;
    const [target] = await listMercadoLibreClientTargets(connection.workspaceId, { connectionId: connection.id });
    if (target?.client) {
      await processMercadoLibreNotification(connection.workspaceId, target, notification);
    }
  } catch (error) {
    console.error('Mercado Libre webhook: error de procesamiento', error?.name);
  }
}

export async function POST(request) {
  const result = await receiveMercadoLibreNotification(request, {
    applicationId: String(process.env.MERCADOLIBRE_CLIENT_ID || '').trim(),
    persist,
    defer: after,
    process: processInBackground,
  });
  return NextResponse.json(result.body, { status: result.status });
}
