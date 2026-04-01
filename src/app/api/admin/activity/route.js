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

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

    const result = await db.execute({
      sql: `SELECT al.id, al.created_at, al.actor_type, al.actor_label, al.action, al.entity_type, al.entity_id, al.metadata_json,
                   w.name AS workspace_name, au.email AS app_user_email
            FROM audit_logs al
            LEFT JOIN workspaces w ON w.id = al.workspace_id
            LEFT JOIN app_users au ON au.id = al.app_user_id
            ORDER BY al.id DESC
            LIMIT ?`,
      args: [limit],
    });

    return NextResponse.json({ activity: result.rows || [] });
  } catch (error) {
    console.error('Admin activity error:', error);
    return NextResponse.json({ error: 'Error en el servidor' }, { status: 500 });
  }
}
