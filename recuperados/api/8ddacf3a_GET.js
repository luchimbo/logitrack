import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/ensureDb";
import { requireWorkspaceActor } from "@/lib/auth";

const VALID_TYPES = [
  "producto_faltante",
  "stock_insuficiente",
  "producto_danado",
  "direccion_invalida",
  "problema_etiqueta",
  "reemplazo_producto",
  "otro",
];

export async function GET(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const workspaceId = authResult.actor.workspaceId;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const args = [workspaceId];
    let where = "WHERE i.workspace_id = ?";
    if (status && status !== "all") {
      where += " AND i.status = ?";
      args.push(status);
    }

    const result = await db.execute({
      sql: `SELECT
        i.*,
        o.order_number AS order_number,
        o.external_order_id AS order_external_id,
        o.customer_name AS customer_name,
        COUNT(DISTINCT ic.id) AS comment_count
      FROM incidents i
      LEFT JOIN orders o ON o.id = i.order_id
      LEFT JOIN incident_comments ic ON ic.incident_id = i.id
      ${where}
      GROUP BY i.id
      ORDER BY i.created_at DESC, i.id DESC`,
      args,
    });

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Error fetching incidents:", error);
    return NextResponse.json({ error: "Failed to fetch incidents" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const actor = authResult.actor;
    const workspaceId = actor.workspaceId;
    const body = await request.json();

    const {
      order_id,
      order_item_id,
      type,
      description,
    } = body || {};

    if (!order_id || !type) {
      return NextResponse.json({ error: "order_id and type are required" }, { status: 400 });
    }

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid incident type" }, { status: 400 });
    }

    const orderCheck = await db.execute({
      sql: "SELECT id FROM orders WHERE id = ? AND workspace_id = ? LIMIT 1",
      args: [order_id, workspaceId],
    });
    if (!orderCheck.rows.length) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const inserted = await db.execute({
      sql: `INSERT INTO incidents (workspace_id, order_id, order_item_id, type, description, status, created_by_app_user_id)
        VALUES (?, ?, ?, ?, ?, 'open', ?)`,
      args: [
        workspaceId,
        order_id,
        order_item_id || null,
        type,
        description || null,
        actor.appUserId || null,
      ],
    });

    const incidentId = Number(inserted.lastInsertRowid);

    await db.execute({
      sql: `INSERT INTO operation_events (workspace_id, order_id, app_user_id, event_type, from_status, to_status, metadata_json)
        VALUES (?, ?, ?, 'incident_created', ?, ?, ?)`,
      args: [
        workspaceId,
        order_id,
        actor.appUserId || null,
        orderCheck.rows[0].operation_status || null,
        orderCheck.rows[0].operation_status || null,
        JSON.stringify({ incident_id: incidentId, type, description }),
      ],
    });

    await db.execute({
      sql: "UPDATE orders SET operation_status = 'incident', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?",
      args: [order_id, workspaceId],
    });

    return NextResponse.json({ success: true, incident_id: incidentId });
  } catch (error) {
    console.error("Error creating incident:", error);
    return NextResponse.json({ error: "Failed to create incident" }, { status: 500 });
  }
}
