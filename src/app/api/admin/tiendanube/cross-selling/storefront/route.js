import { requireWorkspaceAdmin } from '@/lib/auth';
import { changeOffer, offerStatus } from '@/lib/crossselling/storefront-runtime';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
// La tienda se elige en el panel (demo por omisión); el runtime valida que esté habilitada y sea del espacio.
const storeOf = (value) => (/^\d{1,20}$/.test(String(value || '')) ? String(value) : undefined);
export async function GET(request) {
  const auth = await requireWorkspaceAdmin(request);
  if (auth.error) return Response.json(auth.error.body, { status: auth.error.status, headers });
  try { return Response.json(await offerStatus(auth.actor.workspaceId, storeOf(new URL(request.url).searchParams.get('storeId'))), { headers }); }
  catch (e) { return Response.json({ error: e.message }, { status: 409, headers }); }
}
export async function POST(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Origen inválido' }, { status: 403 });
  const auth = await requireWorkspaceAdmin(request);
  if (auth.error) return Response.json(auth.error.body, { status: auth.error.status, headers });
  try {
    if (Number(request.headers.get('content-length')) > 4096) throw new Error('Solicitud demasiado grande');
    const input = await request.json();
    return Response.json(await changeOffer(auth.actor.workspaceId, input, storeOf(input.storeId)), { headers });
  } catch (e) { return Response.json({ error: e.message }, { status: 409, headers }); }
}
