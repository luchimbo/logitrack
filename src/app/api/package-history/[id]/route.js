import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/ensureDb";
import { requireWorkspaceActor } from "@/lib/auth";
import { packageHistoryDetailFromRow } from "@/lib/packageHistory";

export async function GET(request, { params }) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) return NextResponse.json(authResult.error.body, { status: authResult.error.status });

    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Paquete inválido" }, { status: 400 });

    const result = await db.execute({
      sql: `SELECT
        s.id, s.sale_type, s.sale_id, s.tracking_number, s.remitente_id,
        s.external_provider, s.external_order_id, s.external_shipment_id,
        s.product_name, s.sku, s.color, s.voltage, s.quantity,
        s.recipient_name, s.recipient_user, s.recipient_phone,
        s.address, s.postal_code, s.city, s.partido, s.province, s.reference,
        s.shipping_method, s.carrier_code, s.carrier_name, s.assigned_carrier,
        s.status, s.dispatch_date, s.delivery_date, s.created_at, s.batch_id,
        b.date AS batch_date, b.created_at AS batch_created_at,
        COALESCE(NULLIF(TRIM(s.assigned_carrier), ''), NULLIF(TRIM(s.carrier_name), ''), 'Sin asignar') AS carrier
      FROM shipments s
      LEFT JOIN daily_batches b ON b.id = s.batch_id AND b.workspace_id = s.workspace_id
      WHERE s.id = ? AND s.workspace_id = ?
      LIMIT 1`,
      args: [id, authResult.actor.workspaceId],
    });

    if (!result.rows.length) return NextResponse.json({ error: "Paquete no encontrado" }, { status: 404 });
    return NextResponse.json({ item: packageHistoryDetailFromRow(result.rows[0]) });
  } catch (error) {
    console.error("Package history detail error:", error);
    return NextResponse.json({ error: "No se pudo cargar el paquete" }, { status: 500 });
  }
}
