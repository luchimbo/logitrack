import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/ensureDb";
import { requireWorkspaceActor } from "@/lib/auth";

export async function POST(request, { params }) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const actor = authResult.actor;
    const workspaceId = actor.workspaceId;
    const { id } = await params;

    const orderResult = await db.execute({
      sql: "SELECT id, operation_status FROM orders WHERE id = ? AND workspace_id = ? LIMIT 1",
      args: [id, workspaceId],
    });
    if (!orderResult.rows.length) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const currentStatus = orderResult.rows[0].operation_status || "ready_to_pick";
    const existingSession = await db.execute({
      sql: "SELECT id FROM picking_sessions WHERE order_id = ? AND workspace_id = ? AND status = 'active' LIMIT 1",
      args: [id, workspaceId],
    });

    let sessionId = existingSession.rows.length ? Number(existingSession.rows[0].id) : null;
    if (!sessionId) {
      const inserted = await db.execute({
        sql: "INSERT INTO picking_sessions (workspace_id, order_id, app_user_id, status) VALUES (?, ?, ?, 'active')",
        args: [workspaceId, id, actor.appUserId || null],
      });
      sessionId = Number(inserted.lastInsertRowid);

      const items = await db.execute({
        sql: "SELECT id, quantity FROM order_items WHERE order_id = ? AND workspace_id = ?",
        args: [id, workspaceId],
      });
      for (const item of items.rows) {
        await db.execute({
          sql: `INSERT OR IGNORE INTO picking_items (workspace_id, picking_session_id, order_item_id, expected_quantity, picked_quantity)
            VALUES (?, ?, ?, ?, 0)`,
          args: [workspaceId, sessionId, item.id, Number(item.quantity || 1)],
        });
      }
    }

    await db.execute({
      sql: "UPDATE orders SET operation_status = 'picking', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?",
      args: [id, workspaceId],
    });
    await db.execute({
      sql: "UPDATE shipments SET operation_status = 'picking' WHERE id IN (SELECT shipment_id FROM order_shipments WHERE order_id = ? AND workspace_id = ?) AND workspace_id = ?",
      args: [id, workspaceId, workspaceId],
    });
    await db.execute({
      sql: `INSERT INTO operation_events (workspace_id, order_id, app_user_id, event_type, from_status, to_status)
        VALUES (?, ?, ?, 'start_picking', ?, 'picking')`,
      args: [workspaceId, id, actor.appUserId || null, currentStatus],
    });

    return NextResponse.json({ success: true, picking_session_id: sessionId });
  } catch (error) {
    console.error("Error starting picking:", error);
    return NextResponse.json({ error: "Failed to start picking" }, { status: 500 });
  }
}
