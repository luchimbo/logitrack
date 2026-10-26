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
              au.id,
              au.email,
              au.created_at,
              au.last_seen_at,
              w.name AS workspace_name,
              w.slug AS workspace_slug,
              wm.role,
              (SELECT COUNT(*) FROM daily_batches b WHERE b.created_by_app_user_id=au.id) AS batches_created,
              (SELECT COALESCE(SUM(b.total_packages),0) FROM daily_batches b WHERE b.created_by_app_user_id=au.id) AS packages_uploaded,
              (SELECT MAX(al.created_at) FROM audit_logs al WHERE al.app_user_id=au.id) AS last_activity_at
            FROM app_users au
            LEFT JOIN workspace_members wm ON wm.app_user_id=au.id
            LEFT JOIN workspaces w ON w.id=wm.workspace_id
            ORDER BY au.created_at DESC`,
      args: [],
    });

    return NextResponse.json({ users: result.rows || [] });
  } catch (error) {
    console.error('Admin users error:', error);
    return NextResponse.json({ error: 'Error en el servidor' }, { status: 500 });
  }
}
