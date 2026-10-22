import { authorizePublication } from '@/lib/crossselling/publication-auth';
import { lookupCrossSellingConnection } from '@/lib/crossselling/runtime';
import { storeMeliOwnerEmail } from '@/lib/crossselling/stores';
import { db } from '@/lib/db';
import { listMercadoLibreClientTargets } from '@/lib/mercadolibreResolver';
import { collectMeliReviews } from '@/lib/reviews/meli-reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Mostrador pide las opiniones de Mercado Libre de la cuenta vinculada a la tienda (firma HMAC por tienda).
export async function GET(request) {
  const headers = { 'Cache-Control': 'no-store' };
  const storeId = authorizePublication({ request, rawBody: '' });
  if (!storeId) return Response.json({ error: 'Solicitud no autorizada' }, { status: 401, headers });
  try {
    const ownerEmail = storeMeliOwnerEmail(storeId);
    let targets = [];
    if (ownerEmail) {
      // Se usan las cuentas de Mercado Libre conectadas en los espacios de ese usuario de Logitrack.
      const members = await db.execute({ sql: `SELECT DISTINCT m.workspace_id FROM workspace_members m
        JOIN app_users u ON u.id = m.app_user_id WHERE lower(u.email) = lower(?)`, args: [ownerEmail] });
      for (const row of members.rows) targets.push(...await listMercadoLibreClientTargets(Number(row.workspace_id)));
      if (!targets.length) return Response.json({ error: `No hay una cuenta de Mercado Libre conectada en los espacios de ${ownerEmail}` }, { status: 409, headers });
    } else {
      const connection = await lookupCrossSellingConnection(storeId);
      if (!connection?.workspaceId) return Response.json({ error: 'Esta tienda no está vinculada a Logitrack' }, { status: 409, headers });
      targets = await listMercadoLibreClientTargets(connection.workspaceId);
      if (!targets.length) return Response.json({ error: 'No hay una cuenta de Mercado Libre conectada' }, { status: 409, headers });
    }
    const result = { accounts: targets.length, accountErrors: [], firstError: '', items: 0, withoutSkuCount: 0, withoutSku: [], errors: 0, withoutText: 0, withoutReviews: 0, reviews: [] };
    const seen = new Set();
    for (const target of targets) {
      // Una cuenta sin permisos (o sin reconectar) no bloquea a las demás.
      let part;
      try { part = await collectMeliReviews({ client: target.client, sellerId: target.externalStoreId }); }
      catch (error) { result.accountErrors.push(`${target.externalStoreId}: ${String(error.message || '').slice(0, 160)}`); continue; }
      for (const key of ['items', 'withoutSkuCount', 'errors', 'withoutText', 'withoutReviews']) result[key] += part[key];
      result.firstError ||= part.firstError;
      result.withoutSku.push(...part.withoutSku);
      for (const r of part.reviews) if (!seen.has(`${r.externalId}|${r.sku}`)) { seen.add(`${r.externalId}|${r.sku}`); result.reviews.push(r); }
    }
    // Si ninguna cuenta pudo leerse, se informa como error y no como búsqueda vacía.
    if (result.accountErrors.length === targets.length) throw new Error(result.accountErrors.join(' | '));
    return Response.json(result, { headers });
  } catch (error) {
    console.error('Opiniones de Mercado Libre:', error.message || error);
    // El mensaje de Mercado Libre (por ejemplo, un permiso faltante) ayuda a quien administra; no trae datos de clientes.
    return Response.json({ error: `No se pudieron leer las opiniones de Mercado Libre: ${String(error.message || '').slice(0, 200)}` }, { status: 502, headers });
  }
}
