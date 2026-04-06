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
    const userResult = await db.execute({
      sql: `SELECT
              au.id,
              au.email,
              au.created_at,
              au.last_seen_at,
              wm.role,
              w.id AS workspace_id,
              w.name AS workspace_name,
              w.slug AS workspace_slug
            FROM app_users au
            LEFT JOIN workspace_members wm ON wm.app_user_id = au.id
            LEFT JOIN workspaces w ON w.id = wm.workspace_id
            WHERE au.id = ?
            ORDER BY wm.id ASC
            LIMIT 1`,
      args: [id],
    });

    if (!userResult.rows.length) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const user = userResult.rows[0];
    const workspaceId = user.workspace_id;

    const [
      totalShipments,
      totalBatches,
      uploadsByUser,
      todayShipments,
      pickingRows,
      carriers,
      recentBatches,
      recentActivity,
      activityByHour,
    ] = await Promise.all([
      db.execute({ sql: 'SELECT COUNT(*) AS count FROM shipments WHERE workspace_id = ?', args: [workspaceId] }),
      db.execute({ sql: 'SELECT COUNT(*) AS count FROM daily_batches WHERE workspace_id = ?', args: [workspaceId] }),
      db.execute({ sql: 'SELECT COUNT(*) AS count, COALESCE(SUM(total_packages), 0) AS packages FROM daily_batches WHERE created_by_app_user_id = ?', args: [id] }),
      db.execute({
        sql: `SELECT shipping_method, assigned_carrier, province, COUNT(*) AS count
              FROM shipments s
              JOIN daily_batches b ON b.id = s.batch_id
              WHERE s.workspace_id = ? AND b.workspace_id = ? AND b.date = CURRENT_DATE
              GROUP BY shipping_method, assigned_carrier, province`,
        args: [workspaceId, workspaceId],
      }),
      db.execute({
        sql: `SELECT s.product_name, s.sku, s.color, s.shipping_method,
                     SUM(COALESCE(s.quantity, 1)) AS total_quantity,
                     COUNT(*) AS shipment_count
              FROM shipments s
              JOIN daily_batches b ON b.id = s.batch_id
              WHERE s.workspace_id = ? AND b.workspace_id = ? AND b.date = CURRENT_DATE
              GROUP BY s.product_name, s.sku, s.color, s.shipping_method
              ORDER BY s.shipping_method ASC, total_quantity DESC`,
        args: [workspaceId, workspaceId],
      }),
      db.execute({ sql: 'SELECT id, name, display_name, color FROM carriers WHERE workspace_id = ? ORDER BY name', args: [workspaceId] }),
      db.execute({
        sql: `SELECT id, date, filenames, total_packages, created_at
              FROM daily_batches
              WHERE workspace_id = ?
              ORDER BY id DESC
              LIMIT 10`,
        args: [workspaceId],
      }),
      db.execute({
        sql: `SELECT created_at, actor_type, actor_label, action, entity_type, entity_id, metadata_json
              FROM audit_logs
              WHERE workspace_id = ? OR app_user_id = ?
              ORDER BY id DESC
              LIMIT 25`,
        args: [workspaceId, id],
      }),
      db.execute({
        sql: `SELECT strftime('%H', created_at) AS hour, COUNT(*) AS count
              FROM audit_logs
              WHERE app_user_id = ?
              GROUP BY strftime('%H', created_at)
              ORDER BY hour ASC`,
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

    for (const row of todayShipments.rows) {
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

    const pickingList = pickingRows.rows || [];
    const colectaItems = pickingList.filter((p) => p.shipping_method === 'colecta');
    const flexItems = pickingList.filter((p) => p.shipping_method === 'flex');

    return NextResponse.json({
      user,
      workspace: {
        id: workspaceId,
        name: user.workspace_name,
        slug: user.workspace_slug,
      },
      totals: {
        shipments: Number(totalShipments.rows[0]?.count || 0),
        batches: Number(totalBatches.rows[0]?.count || 0),
        userBatches: Number(uploadsByUser.rows[0]?.count || 0),
        userPackages: Number(uploadsByUser.rows[0]?.packages || 0),
      },
      today: {
        total: todaySummary.total,
        flex: todaySummary.flex,
        colecta: todaySummary.colecta,
        byCarrier: todaySummary.byCarrier,
        byProvince: todaySummary.byProvince,
      },
      picking: {
        totalProducts: pickingList.length,
        colecta: colectaItems,
        flex: flexItems,
      },
      carriers: carriers.rows || [],
      recentBatches: recentBatches.rows || [],
      recentActivity: recentActivity.rows || [],
      activityByHour: activityByHour.rows || [],
    });
  } catch (error) {
    console.error('Admin user detail error:', error);
    return NextResponse.json({ error: 'Error en el servidor' }, { status: 500 });
  }
}
