import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireGlobalAdmin } from '@/lib/auth';

export async function GET(request, { params }) {
  try {
    await ensureDb();
    const authResult = await requireGlobalAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const { id } = await params;

    const workspaceResult = await db.execute({
      sql: `SELECT
              w.id,
              w.name,
              w.slug,
              w.created_at,
              owner.email AS owner_email,
              COUNT(DISTINCT wm.id) AS members
            FROM workspaces w
            LEFT JOIN workspace_members wm ON wm.workspace_id = w.id
            LEFT JOIN workspace_members owner_wm ON owner_wm.workspace_id = w.id AND owner_wm.role = 'owner'
            LEFT JOIN app_users owner ON owner.id = owner_wm.app_user_id
            WHERE w.id = ?
            GROUP BY w.id, w.name, w.slug, w.created_at, owner.email
            LIMIT 1`,
      args: [id],
    });

    if (!workspaceResult.rows.length) {
      return NextResponse.json({ error: 'Workspace no encontrado' }, { status: 404 });
    }

    const workspace = workspaceResult.rows[0];

    const [totals, today, week, month, carriers, topProducts, topProvinces, recentBatches, recentActivity, members] = await Promise.all([
      Promise.all([
        db.execute({ sql: 'SELECT COUNT(*) AS count FROM shipments WHERE workspace_id = ?', args: [id] }),
        db.execute({ sql: 'SELECT COUNT(*) AS count FROM daily_batches WHERE workspace_id = ?', args: [id] }),
      ]),
      db.execute({
        sql: `SELECT shipping_method, assigned_carrier, province, COUNT(*) AS count
              FROM shipments s
              JOIN daily_batches b ON b.id = s.batch_id
              WHERE s.workspace_id = ? AND b.workspace_id = ? AND b.date = CURRENT_DATE
              GROUP BY shipping_method, assigned_carrier, province`,
        args: [id, id],
      }),
      db.execute({
        sql: `SELECT COUNT(*) AS count
              FROM shipments s
              JOIN daily_batches b ON b.id = s.batch_id
              WHERE s.workspace_id = ? AND b.workspace_id = ? AND b.date >= date('now', '-6 day') AND b.date <= CURRENT_DATE`,
        args: [id, id],
      }),
      db.execute({
        sql: `SELECT COUNT(*) AS count
              FROM shipments s
              JOIN daily_batches b ON b.id = s.batch_id
              WHERE s.workspace_id = ? AND b.workspace_id = ? AND b.date >= date('now', 'start of month') AND b.date <= CURRENT_DATE`,
        args: [id, id],
      }),
      db.execute({ sql: 'SELECT id, name, display_name, color FROM carriers WHERE workspace_id = ? ORDER BY name', args: [id] }),
      db.execute({
        sql: `SELECT product_name, sku, shipping_method, SUM(COALESCE(quantity, 1)) AS units, COUNT(*) AS shipments
              FROM shipments
              WHERE workspace_id = ?
              GROUP BY product_name, sku, shipping_method
              ORDER BY units DESC, shipments DESC
              LIMIT 10`,
        args: [id],
      }),
      db.execute({
        sql: `SELECT province, COUNT(*) AS shipments
              FROM shipments
              WHERE workspace_id = ?
              GROUP BY province
              ORDER BY shipments DESC
              LIMIT 8`,
        args: [id],
      }),
      db.execute({
        sql: `SELECT id, date, filenames, total_packages, created_at
              FROM daily_batches
              WHERE workspace_id = ?
              ORDER BY id DESC
              LIMIT 10`,
        args: [id],
      }),
      db.execute({
        sql: `SELECT created_at, actor_type, actor_label, action, entity_type, entity_id, metadata_json
              FROM audit_logs
              WHERE workspace_id = ?
              ORDER BY id DESC
              LIMIT 25`,
        args: [id],
      }),
      db.execute({
        sql: `SELECT au.email, wm.role, au.created_at, au.last_seen_at
              FROM workspace_members wm
              JOIN app_users au ON au.id = wm.app_user_id
              WHERE wm.workspace_id = ?
              ORDER BY wm.role DESC, au.email ASC`,
        args: [id],
      }),
    ]);

    const todaySummary = {
      total: 0,
      flex: 0,
      colecta: 0,
      byCarrier: {},
      byProvince: {},
    };

    for (const row of today.rows) {
      const count = Number(row.count || 0);
      todaySummary.total += count;
      if (row.shipping_method === 'flex') {
        todaySummary.flex += count;
        const carrier = row.assigned_carrier || 'Sin asignar';
        todaySummary.byCarrier[carrier] = (todaySummary.byCarrier[carrier] || 0) + count;
      }
      if (row.shipping_method === 'colecta') {
        todaySummary.colecta += count;
      }
      const prov = row.province || 'Desconocida';
      todaySummary.byProvince[prov] = (todaySummary.byProvince[prov] || 0) + count;
    }

    return NextResponse.json({
      workspace,
      totals: {
        shipments: Number(totals[0].rows[0]?.count || 0),
        batches: Number(totals[1].rows[0]?.count || 0),
        shipments7d: Number(week.rows[0]?.count || 0),
        shipmentsMonth: Number(month.rows[0]?.count || 0),
      },
      today: todaySummary,
      carriers: carriers.rows || [],
      topProducts: topProducts.rows || [],
      topProvinces: topProvinces.rows || [],
      recentBatches: recentBatches.rows || [],
      recentActivity: recentActivity.rows || [],
      members: members.rows || [],
    });
  } catch (error) {
    console.error('Admin workspace detail error:', error);
    return NextResponse.json({ error: 'Error en el servidor' }, { status: 500 });
  }
}
