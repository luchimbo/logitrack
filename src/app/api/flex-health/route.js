import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDateRange } from "@/lib/dateUtils";
import { ensureDb } from "@/lib/ensureDb";
import { requireWorkspaceActor } from "@/lib/auth";
import { ZONE_GROUPS, normalizeName } from "@/lib/zoneGroups";

function incrementCount(map, key) {
  map[key] = (map[key] || 0) + 1;
}

export async function GET(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }
    const workspaceId = authResult.actor.workspaceId;

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "today";
    const specificDate = searchParams.get("date");
    const batchId = searchParams.get("batch_id");

    let shipmentsSql;
    let shipmentsArgs = [];

    if (batchId) {
      shipmentsSql = `SELECT id, batch_id, tracking_number, partido, city, province, postal_code, assigned_carrier
        FROM shipments
        WHERE workspace_id = ? AND batch_id = ? AND shipping_method = 'flex'
        ORDER BY id DESC`;
      shipmentsArgs = [workspaceId, batchId];
    } else {
      const range = getDateRange(period, specificDate);
      shipmentsSql = `SELECT s.id, s.batch_id, s.tracking_number, s.partido, s.city, s.province, s.postal_code, s.assigned_carrier
        FROM shipments s
        JOIN daily_batches b ON s.batch_id = b.id
        WHERE s.workspace_id = ? AND b.workspace_id = ? AND b.date >= ? AND b.date <= ? AND s.shipping_method = 'flex'
        ORDER BY s.id DESC`;
      shipmentsArgs = [workspaceId, workspaceId, range.from, range.to];
    }

    const [shipmentsResult, mappingsResult] = await Promise.all([
      db.execute({ sql: shipmentsSql, args: shipmentsArgs }),
      db.execute({ sql: "SELECT partido, carrier_name FROM zone_mappings WHERE workspace_id = ?", args: [workspaceId] }),
    ]);

    const shipments = shipmentsResult.rows || [];
    const mappings = mappingsResult.rows || [];

    const mappedPartidos = new Set(mappings.map((x) => normalizeName(x.partido)));

    const byCarrier = {};
    const byZone = {};
    const unknownPartidos = {};

    let totalFlex = 0;
    let assigned = 0;
    let unassigned = 0;
    let withoutPartido = 0;
    let withoutCity = 0;
    let unknownZoneGroup = 0;
    let assignableUnassigned = 0;

    for (const shipment of shipments) {
      totalFlex += 1;

      const assignedCarrier = shipment.assigned_carrier || null;
      const partidoNorm = normalizeName(shipment.partido);
      const hasPartido = Boolean(partidoNorm);
      const hasCity = Boolean((shipment.city || "").trim());
      const hasMapping = hasPartido && mappedPartidos.has(partidoNorm);
      const zoneGroup = hasPartido ? (ZONE_GROUPS[partidoNorm] || null) : null;

      if (assignedCarrier) {
        assigned += 1;
        incrementCount(byCarrier, assignedCarrier);
      } else {
        unassigned += 1;
        incrementCount(byCarrier, "SIN_ASIGNAR");
        if (hasPartido && hasMapping) {
          assignableUnassigned += 1;
        }
      }

      if (!hasPartido) {
        withoutPartido += 1;
      }

      if (!hasCity) {
        withoutCity += 1;
      }

      if (hasPartido) {
        if (!zoneGroup) {
          unknownZoneGroup += 1;
        }
        if (!hasMapping) {
          incrementCount(unknownPartidos, partidoNorm);
        }
      }

      incrementCount(byZone, zoneGroup || (hasPartido ? "SIN_ZONA" : "SIN_PARTIDO"));
    }

    let status = "green";
    if (assignableUnassigned > 0) {
      status = "red";
    } else if (unassigned > 0 || withoutPartido > 0 || unknownZoneGroup > 0) {
      status = "yellow";
    }

    const unknownPartidosList = Object.entries(unknownPartidos)
      .map(([partido, count]) => ({ partido, count }))
      .sort((a, b) => b.count - a.count || a.partido.localeCompare(b.partido));

    return NextResponse.json({
      status,
      checked_at: new Date().toISOString(),
      period: batchId ? "batch" : period,
      batch_id: batchId || null,
      totals: {
        total_flex: totalFlex,
        assigned,
        unassigned,
        assignable_unassigned: assignableUnassigned,
        without_partido: withoutPartido,
        without_city: withoutCity,
        unknown_zone_group: unknownZoneGroup,
      },
      by_carrier: byCarrier,
      by_zone: byZone,
      unknown_partidos: unknownPartidosList,
    });
  } catch (error) {
    console.error("Flex health error:", error);
    return NextResponse.json({ error: "Failed to compute flex health" }, { status: 500 });
  }
}
