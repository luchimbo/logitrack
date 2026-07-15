import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';

export async function POST(request) {
  try {
    await ensureDb();
    
    // Check if user is logged in
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }
    const workspaceId = authResult.actor.workspaceId;
    const workspaceSlug = authResult.actor.workspaceSlug;
    
    // Only allow for GeoModi workspace (slug = 'legacy')
    if (workspaceSlug !== 'legacy') {
      return NextResponse.json({ error: 'Funcionalidad reservada para GeoModi (camilopcmidi)' }, { status: 403 });
    }
    
    const body = await request.json();
    const { id, packed } = body;
    
    if (!id || packed === undefined) {
      return NextResponse.json({ error: 'ID y estado empaquetado son requeridos' }, { status: 400 });
    }
    
    const packedVal = packed ? 1 : 0;
    
    // Update local database state
    await db.execute({
      sql: 'UPDATE google_sheets_shipments SET packed = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?',
      args: [packedVal, id, workspaceId]
    });
    
    return NextResponse.json({
      ok: true,
      message: 'Estado de empaquetado actualizado correctamente'
    });
    
  } catch (error) {
    console.error('Error updating packing status:', error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}
