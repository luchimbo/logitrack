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

    const sessionResult = await db.execute({
      sql: "SELECT id FROM picking_sessions WHERE order_id = ? AND workspace_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
      args: [id, workspaceId],
    });
    if (!sessionResult.rows.length) {
      return NextResponse.json({ error: "No active picking session" }, { status: 400 });
    }

    const sessionId = Number(sessionResult.rows[0].id);
    await db.execute({
      sql: `UPDATE picking_items
        SET picked_quantity = expected_quantity, updated_at = CURRENT_TIMESTAMP
        WHERE picking_session_id = ? AND workspace_id = ?`,
      args: [sessionId, workspaceId],
    });
    await db.execute({
      sql: "UPDATE picking_sessions SET status = 'finished', finished_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?",
      args: [sessionId, workspaceId],
    });
    await db.execute({
      sql: "UPDATE orders SET operation_status = 'picked', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?",
      args: [id, workspaceId],
    });
    await db.execute({
      sql: "UPDATE shipments SET operation_status = 'picked' WHERE id IN (SELECT shipment_id FROM order_shipments WHERE order_id = ? AND workspace_id = ?) AND workspace_id = ?",
      args: [id, workspaceId, workspaceId],
    });
    await db.execute({
      sql: `INSERT INTO operation_events (workspace_id, order_id, app_user_id, event_type, from_status, to_status)
        VALUES (?, ?, ?, 'finish_picking', 'picking', 'picked')`,
      args: [workspaceId, id, actor.appUserId || null],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error finishing picking:", error);
    return NextResponse.json({ error: "Failed to finish picking" }, { status: 500 });
  }
}
