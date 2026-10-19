import { acceptOffer } from '@/lib/crossselling/storefront-runtime';
import { corsHeaders, fromStorefront, storefrontError } from '../cors';
export const dynamic = 'force-dynamic';
export const OPTIONS = () => new Response(null, { status: 204, headers: corsHeaders });
// El cuerpo llega como text/plain para evitar el preflight; se valida el origen.
export async function POST(request) {
  if (!fromStorefront(request)) return Response.json({ error: 'Origen inválido' }, { status: 403 });
  try {
    if (Number(request.headers.get('content-length')) > 1024) return storefrontError(Object.assign(new Error('Solicitud demasiado grande'), { status: 400 }));
    const raw = await request.text();
    if (raw.length > 1024) return storefrontError(Object.assign(new Error('Solicitud demasiado grande'), { status: 400 }));
    const input = JSON.parse(raw);
    if (input.store !== '7570182') return storefrontError(Object.assign(new Error('Tienda no habilitada'), { status: 404 }));
    return Response.json(await acceptOffer(input), { headers: corsHeaders });
  } catch (error) {
    return storefrontError(error instanceof SyntaxError ? Object.assign(new Error('Solicitud inválida'), { status: 400 }) : error);
  }
}
