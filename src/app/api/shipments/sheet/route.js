import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
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
    
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending'; // pending (default), packed, all
    const q = searchParams.get('q') || '';
    const method = searchParams.get('method') || 'all'; // all, Flex Dani, Expreso, Flex Entregoya, etc.
    
    let sql = 'SELECT * FROM google_sheets_shipments WHERE workspace_id = ?';
    let args = [workspaceId];
    
    // Default: only show non-dispatched (pending)
    if (status === 'pending' || status === 'all') {
      sql += ' AND dispatched = 0';
    } else if (status === 'packed') {
      sql += ' AND packed = 1 AND dispatched = 0';
    }
    // status === 'history' shows everything (no filter)
    
    if (method !== 'all') {
      sql += ' AND shipping_method = ?';
      args.push(method);
    }
    
    if (q) {
      sql += ' AND (client_name LIKE ? OR order_id LIKE ? OR product_name LIKE ? OR address LIKE ? OR city LIKE ? OR notes LIKE ?)';
      const searchPattern = `%${q}%`;
      args.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    // Order by date and row index (newer first)
    sql += ' ORDER BY row_index DESC';
    
    const result = await db.execute({ sql, args });
    
    // Also get the count of pending (not dispatched) shipments for the sidebar badge
    const badgeCountResult = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM google_sheets_shipments WHERE workspace_id = ? AND dispatched = 0',
      args: [workspaceId]
    });
    const pendingCount = Number(badgeCountResult.rows[0]?.count || 0);
    
    return NextResponse.json({
      ok: true,
      shipments: result.rows || [],
      pendingCount
    });
    
  } catch (error) {
    console.error('Error fetching spreadsheet shipments:', error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}
