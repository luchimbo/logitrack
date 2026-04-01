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

    const [totals, activeToday, activeWeek, recentUsers, topWorkspaces, recentActivity] = await Promise.all([
      Promise.all([
        db.execute({ sql: 'SELECT COUNT(*) AS count FROM app_users', args: [] }),
        db.execute({ sql: 'SELECT COUNT(*) AS count FROM workspaces', args: [] }),
        db.execute({ sql: 'SELECT COUNT(*) AS count FROM shipments', args: [] }),
        db.execute({ sql: 'SELECT COUNT(*) AS count FROM daily_batches', args: [] }),
      ]),
      db.execute({ sql: "SELECT COUNT(*) AS count FROM app_users WHERE last_seen_at >= datetime('now', '-1 day')", args: [] }),
      db.execute({ sql: "SELECT COUNT(*) AS count FROM app_users WHERE last_seen_at >= datetime('now', '-7 day')", args: [] }),
      db.execute({
        sql: `SELECT email, created_at, last_seen_at
              FROM app_users
              ORDER BY created_at DESC
              LIMIT 5`,
        args: [],
      }),
      db.execute({
        sql: `SELECT w.id, w.name, w.slug,
                     COUNT(DISTINCT wm.app_user_id) AS members,
                     COUNT(DISTINCT s.id) AS shipments,
                     COUNT(DISTINCT b.id) AS batches
              FROM workspaces w
              LEFT JOIN workspace_members wm ON wm.workspace_id = w.id
              LEFT JOIN shipments s ON s.workspace_id = w.id
              LEFT JOIN daily_batches b ON b.workspace_id = w.id
              GROUP BY w.id, w.name, w.slug
              ORDER BY shipments DESC, batches DESC, w.id DESC
              LIMIT 8`,
        args: [],
      }),
      db.execute({
        sql: `SELECT created_at, actor_type, actor_label, action, entity_type, entity_id, workspace_id, metadata_json
              FROM audit_logs
              ORDER BY id DESC
              LIMIT 20`,
        args: [],
      }),
    ]);

    return NextResponse.json({
      totals: {
        users: Number(totals[0].rows[0]?.count || 0),
        workspaces: Number(totals[1].rows[0]?.count || 0),
        shipments: Number(totals[2].rows[0]?.count || 0),
        batches: Number(totals[3].rows[0]?.count || 0),
        activeToday: Number(activeToday.rows[0]?.count || 0),
        activeWeek: Number(activeWeek.rows[0]?.count || 0),
      },
      recentUsers: recentUsers.rows || [],
      topWorkspaces: topWorkspaces.rows || [],
      recentActivity: recentActivity.rows || [],
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    return NextResponse.json({ error: 'Error en el servidor' }, { status: 500 });
  }
}
