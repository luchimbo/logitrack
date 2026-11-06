import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/ensureDb";
import { requireWorkspaceActor } from "@/lib/auth";

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
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 100), 1), 300);

    const args = [workspaceId];
    let where = "WHERE o.workspace_id = ?";
    if (status && status !== "all") {
      where += " AND o.operation_status = ?";
      args.push(status);
    }

    const result = await db.execute({
      sql: `SELECT
        o.*,
        COUNT(DISTINCT oi.id) AS item_count,
        COALESCE(SUM(oi.quantity), 0) AS unit_count,
        COUNT(DISTINCT os.shipment_id) AS shipment_count
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN order_shipments os ON os.order_id = o.id
      ${where}
      GROUP BY o.id
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT ?`,
      args: [...args, limit],
    });

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}
