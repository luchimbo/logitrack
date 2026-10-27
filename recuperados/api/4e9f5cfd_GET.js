import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/ensureDb";
import { requireWorkspaceActor } from "@/lib/auth";

export async function GET(request, { params }) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const workspaceId = authResult.actor.workspaceId;
    const { id } = await params;

    const orderResult = await db.execute({
      sql: "SELECT * FROM orders WHERE id = ? AND workspace_id = ? LIMIT 1",
      args: [id, workspaceId],
    });

    if (!orderResult.rows.length) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const [itemsResult, shipmentsResult, sessionResult, eventsResult] = await Promise.all([
      db.execute({
        sql: `SELECT oi.*, pi.expected_quantity, pi.picked_quantity
          FROM order_items oi
          LEFT JOIN picking_sessions ps ON ps.order_id = oi.order_id AND ps.status = 'active'
          LEFT JOIN picking_items pi ON pi.picking_session_id = ps.id AND pi.order_item_id = oi.id
          WHERE oi.order_id = ? AND oi.workspace_id = ?
          ORDER BY oi.id ASC`,
        args: [id, workspaceId],
      }),
      db.execute({
        sql: `SELECT s.* FROM shipments s
          JOIN order_shipments os ON os.shipment_id = s.id
          WHERE os.order_id = ? AND os.workspace_id = ?
          ORDER BY s.id DESC`,
        args: [id, workspaceId],
      }),
      db.execute({
        sql: "SELECT * FROM picking_sessions WHERE order_id = ? AND workspace_id = ? ORDER BY id DESC LIMIT 1",
        args: [id, workspaceId],
      }),
      db.execute({
        sql: "SELECT * FROM operation_events WHERE order_id = ? AND workspace_id = ? ORDER BY created_at DESC, id DESC LIMIT 20",
        args: [id, workspaceId],
      }),
    ]);

    return NextResponse.json({
      order: orderResult.rows[0],
      items: itemsResult.rows,
      shipments: shipmentsResult.rows,
      picking_session: sessionResult.rows[0] || null,
      events: eventsResult.rows,
    });
  } catch (error) {
    console.error("Error fetching order detail:", error);
    return NextResponse.json({ error: "Failed to fetch order" }, { status: 500 });
  }
}
