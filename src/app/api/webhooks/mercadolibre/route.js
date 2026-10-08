import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { processMercadoLibreNotification } from '@/lib/mercadolibreNotificationProcessor';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';
export async function POST(request) {
  let notificationId = null;
  try {
    await ensureDb();
    const body = await request.json();
    const inserted = await db.execute({ sql: 'INSERT INTO mercadolibre_notifications (topic, resource, user_id, application_id, payload_json) VALUES (?, ?, ?, ?, ?)', args: [body.topic || '', body.resource || '', String(body.user_id || ''), String(body.application_id || ''), JSON.stringify(body)] });
    notificationId = inserted.lastInsertRowid;
    const result = await processMercadoLibreNotification(body);
    await db.execute({ sql: 'UPDATE mercadolibre_notifications SET processed_at = CURRENT_TIMESTAMP WHERE id = ?', args: [notificationId] });
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error('Mercado Libre webhook:', error);
    return NextResponse.json({ received: Boolean(notificationId), pending: Boolean(notificationId) }, { status: notificationId ? 200 : 503 });
  }
}
