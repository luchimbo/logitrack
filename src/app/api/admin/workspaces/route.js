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
      sql: `SELECT w.id, w.name, w.slug, w.created_at,
              (SELECT u.email FROM workspace_members m JOIN app_users u ON u.id=m.app_user_id WHERE m.workspace_id=w.id AND m.role='owner' ORDER BY m.id LIMIT 1) AS owner_email,
              (SELECT COUNT(*) FROM workspace_members m WHERE m.workspace_id=w.id) AS members,
              (SELECT COUNT(*) FROM shipments s WHERE s.workspace_id=w.id) AS shipments,
              (SELECT COUNT(*) FROM daily_batches b WHERE b.workspace_id=w.id) AS batches,
              (SELECT MAX(a.created_at) FROM audit_logs a WHERE a.workspace_id=w.id) AS last_activity_at
            FROM workspaces w ORDER BY w.created_at DESC`,
      args: [],
    });

    return NextResponse.json({ workspaces: result.rows || [] });
  } catch (error) {
    console.error('Admin workspaces error:', error);
    return NextResponse.json({ error: 'Error en el servidor' }, { status: 500 });
  }
}
