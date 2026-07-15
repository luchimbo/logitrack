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
    const { id } = body;
    
    if (!id) {
      return NextResponse.json({ error: 'ID de envío es requerido' }, { status: 400 });
    }
    
    // Retrieve row details
    const shipmentResult = await db.execute({
      sql: 'SELECT id, row_index, timestamp, client_name, product_name FROM google_sheets_shipments WHERE id = ? AND workspace_id = ? LIMIT 1',
      args: [id, workspaceId]
    });
    
    if (shipmentResult.rows.length === 0) {
      return NextResponse.json({ error: 'Envío no encontrado' }, { status: 404 });
    }
    
    const shipment = shipmentResult.rows[0];
    const appsScriptUrl = process.env.GOOGLE_SHEET_APPS_SCRIPT_URL;
    
    if (!appsScriptUrl) {
      console.warn("⚠️ GOOGLE_SHEET_APPS_SCRIPT_URL not configured. Updating locally only.");
    } else {
      // Send write back request to Google Sheets
      const response = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'mark_dispatched',
          row_index: shipment.row_index,
          timestamp: shipment.timestamp
        })
      });
      
      if (!response.ok) {
        throw new Error(`Google Sheets API respondió con error: ${response.statusText}`);
      }
      
      const resData = await response.json();
      if (!resData.ok) {
        throw new Error(`Google Sheets script error: ${resData.error || 'Error desconocido'}`);
      }
    }
    
    // Update local database state
    await db.execute({
      sql: 'UPDATE google_sheets_shipments SET dispatched = 1, notified = 1, synced_at = CURRENT_TIMESTAMP WHERE id = ?',
      args: [id]
    });
    
    return NextResponse.json({
      ok: true,
      message: 'Envío marcado como despachado correctamente'
    });
    
  } catch (error) {
    console.error('Error dispatching spreadsheet shipment:', error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}
