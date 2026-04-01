import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireGlobalAdmin } from '@/lib/auth';

export async function GET(request) {
  try {
    await ensureDb();
    const authResult = await requireGlobalAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const result = await db.execute({
      sql: `SELECT
              w.id,
              w.name,
              w.slug,
              w.created_at,
              owner.email AS owner_email,
              COUNT(DISTINCT wm.id) AS members,
              COUNT(DISTINCT s.id) AS shipments,
              COUNT(DISTINCT b.id) AS batches,
              MAX(al.created_at) AS last_activity_at
            FROM workspaces w
            LEFT JOIN workspace_members wm ON wm.workspace_id = w.id
            LEFT JOIN workspace_members owner_wm ON owner_wm.workspace_id = w.id AND owner_wm.role = 'owner'
            LEFT JOIN app_users owner ON owner.id = owner_wm.app_user_id
            LEFT JOIN shipments s ON s.workspace_id = w.id
            LEFT JOIN daily_batches b ON b.workspace_id = w.id
            LEFT JOIN audit_logs al ON al.workspace_id = w.id
            GROUP BY w.id, w.name, w.slug, w.created_at, owner.email
            ORDER BY w.created_at DESC`,
      args: [],
    });

    return NextResponse.json({ workspaces: result.rows || [] });
  } catch (error) {
    console.error('Admin workspaces error:', error);
    return NextResponse.json({ error: 'Error en el servidor' }, { status: 500 });
  }
}
