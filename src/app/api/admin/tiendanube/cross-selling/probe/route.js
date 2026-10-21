import { requireWorkspaceAdmin } from '@/lib/auth';
import { changeProbe, probeStatus } from '@/lib/crossselling/demo-probe';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request) {
  const auth = await requireWorkspaceAdmin(request);
  if (auth.error) return Response.json(auth.error.body, { status: auth.error.status, headers });
  try { return Response.json(await probeStatus(auth.actor.workspaceId), { headers }); }
  catch (e) { return Response.json({ error: e.message }, { status: 409, headers }); }
}
export async function POST(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Origen inválido' }, { status: 403 });
  const auth = await requireWorkspaceAdmin(request);
  if (auth.error) return Response.json(auth.error.body, { status: auth.error.status, headers });
  try {
    if (Number(request.headers.get('content-length')) > 4096) throw new Error('Solicitud demasiado grande');
    return Response.json(await changeProbe(auth.actor.workspaceId, await request.json()), { headers });
  } catch (e) { return Response.json({ error: e.message }, { status: 409, headers }); }
}
