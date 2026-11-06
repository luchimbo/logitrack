import { authorizePublication } from '@/lib/crossselling/publication-auth';
import { lookupCrossSellingConnection } from '@/lib/crossselling/runtime';
import { storeMeliOwnerEmail } from '@/lib/crossselling/stores';
import { db } from '@/lib/db';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { collectMeliReviews } from '@/lib/reviews/meli-reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function targetsFor(storeId) {
  const ownerEmail = storeMeliOwnerEmail(storeId);
  if (ownerEmail) {
    // Se usan las cuentas de Mercado Libre conectadas en los espacios de ese usuario de Logitrack.
    const members = await db.execute({ sql: `SELECT DISTINCT m.workspace_id FROM workspace_members m
      JOIN app_users u ON u.id = m.app_user_id WHERE lower(u.email) = lower(?) ORDER BY m.workspace_id`, args: [ownerEmail] });
    const targets = [];
    for (const row of members.rows) targets.push(...await listMercadoLibreClientTargets(Number(row.workspace_id)));
    if (!targets.length) throw Object.assign(new Error(`No hay una cuenta de Mercado Libre conectada en los espacios de ${ownerEmail}`), { status: 409 });
    return targets;
  }
  const connection = await lookupCrossSellingConnection(storeId);
  if (!connection?.workspaceId) throw Object.assign(new Error('Esta tienda no está vinculada a Logitrack'), { status: 409 });
  const targets = await listMercadoLibreClientTargets(connection.workspaceId);
  if (!targets.length) throw Object.assign(new Error('No hay una cuenta de Mercado Libre conectada'), { status: 409 });
  return targets;
}

// Mostrador pide las opiniones de a una tanda: ?part=<cuenta>&offset=<publicación>&limit=<cantidad> (firma HMAC por tienda).
// Responde `accounts` (cuántas cuentas hay) y `nextOffset` (null al terminar la cuenta).
export async function GET(request) {
  const headers = { 'Cache-Control': 'no-store' };
  const storeId = authorizePublication({ request, rawBody: '' });
  if (!storeId) return Response.json({ error: 'Solicitud no autorizada' }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const part = Math.max(0, Number.parseInt(params.get('part') || '0', 10) || 0);
  const offset = Math.max(0, Number.parseInt(params.get('offset') || '0', 10) || 0);
  const limit = Math.min(300, Math.max(1, Number.parseInt(params.get('limit') || '150', 10) || 150));
  try {
    const targets = await targetsFor(storeId);
    const target = targets[part];
    if (!target) return Response.json({ accounts: targets.length, part, items: 0, total: 0, nextOffset: null, reviews: [] }, { headers });
    const result = await collectMeliReviews({ client: target.client, sellerId: target.externalStoreId, offset, limit });
    return Response.json({ accounts: targets.length, part, ...result }, { headers });
  } catch (error) {
    if (error.status === 409) return Response.json({ error: error.message }, { status: 409, headers });
    console.error('Opiniones de Mercado Libre:', error.message || error);
    // El mensaje de Mercado Libre (por ejemplo, un permiso faltante) ayuda a quien administra; no trae datos de clientes.
    return Response.json({ error: `No se pudieron leer las opiniones de Mercado Libre: ${String(error.message || '').slice(0, 200)}` }, { status: 502, headers });
  }
}
