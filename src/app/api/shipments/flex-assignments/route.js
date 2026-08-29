import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/ensureDb";
import { requireWorkspaceActor } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { normalizeShipmentIds } from "@/lib/shipmentDeletion";
import { bumpFlexPortalRevision } from "@/lib/flexPortal";

export async function PATCH(request) {
  try {
    await ensureDb(); const auth = await requireWorkspaceActor(request);
    if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const { ids, carrierName } = await request.json(); const selected = normalizeShipmentIds(ids); const target = String(carrierName || "").trim();
    if (!selected.length || !target) return NextResponse.json({ error: "Elegí paquetes y transportista" }, { status: 400 });
    const carrier = await db.execute({ sql: "SELECT display_name FROM carriers WHERE workspace_id = ? AND name = ? LIMIT 1", args: [auth.actor.workspaceId, target] });
    if (!carrier.rows.length) return NextResponse.json({ error: "El transportista no está disponible" }, { status: 400 });
    const placeholders = selected.map(() => "?").join(",");
    const owned = await db.execute({ sql: `SELECT id FROM shipments WHERE workspace_id = ? AND shipping_method = 'flex' AND id IN (${placeholders})`, args: [auth.actor.workspaceId, ...selected] });
    if (owned.rows.length !== selected.length) return NextResponse.json({ error: "Solo podés mover paquetes Flex válidos" }, { status: 400 });
    await db.execute({ sql: `UPDATE shipments SET assigned_carrier = ? WHERE workspace_id = ? AND id IN (${placeholders})`, args: [target, auth.actor.workspaceId, ...selected] });
    await bumpFlexPortalRevision(db, auth.actor.workspaceId);
    await logAudit({ workspaceId: auth.actor.workspaceId, appUserId: auth.actor.appUserId, actorType: auth.actor.authType, actorLabel: auth.actor.email || auth.actor.username, action: "flex_assignments_changed", entityType: "shipment", entityId: selected.join(","), metadata: { ids: selected, carrierName: target } });
    return NextResponse.json({ success: true, ids: selected, carrierName: target, carrierDisplayName: carrier.rows[0].display_name || target });
  } catch (error) { console.error("Flex assignments error", error); return NextResponse.json({ error: "No se pudieron mover los paquetes" }, { status: 500 }); }
}
