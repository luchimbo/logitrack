import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getDateRange } from "@/lib/dateUtils";
import { ensureDb } from "@/lib/ensureDb";

const ZONE_GROUPS = {
  capital_federal: "CABA",
  san_isidro: "GBA 1",
  vicente_lopez: "GBA 1",
  san_fernando: "GBA 1",
  san_martin: "GBA 1",
  "3_de_febrero": "GBA 1",
  hurlingham: "GBA 1",
  ituzaingo: "GBA 1",
  moron: "GBA 1",
  avellaneda: "GBA 1",
  lanus: "GBA 1",
  tigre: "GBA 2",
  malvinas_argentinas: "GBA 2",
  jose_c_paz: "GBA 2",
  san_miguel: "GBA 2",
  moreno: "GBA 2",
  merlo: "GBA 2",
  la_matanza: "GBA 2",
  la_matanza_sur: "GBA 2",
  la_matanza_norte: "GBA 1",
  ezeiza: "GBA 2",
  esteban_echeverria: "GBA 2",
  almirante_brown: "GBA 2",
  lomas_de_zamora: "GBA 1",
  quilmes: "GBA 2",
  berazategui: "GBA 2",
  florencio_varela: "GBA 2",
  escobar: "GBA 3",
  ingeniero_maschwitz: "GBA 3",
  pilar: "GBA 3",
  villa_rosa: "GBA 3",
  matheu: "GBA 3",
  dique_lujan: "GBA 3",
  lujan: "GBA 3",
  general_rodriguez: "GBA 3",
  marcos_paz: "GBA 3",
  canuelas: "GBA 3",
  san_vicente: "GBA 3",
  pte_peron: "GBA 3",
  ensenada: "GBA 3",
  la_plata: "GBA 3",
  berisso: "GBA 3",
};

function normalizeName(name) {
  if (!name) return "";
  let s = String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  s = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (s.includes("la_plata")) return "la_plata";
  return s;
}

function incrementCount(map, key) {
  map[key] = (map[key] || 0) + 1;
}

export async function GET(request) {
  try {
    await ensureDb();

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "today";
    const specificDate = searchParams.get("date");
    const batchId = searchParams.get("batch_id");

    let shipmentsSql;
    let shipmentsArgs = [];

    if (batchId) {
      shipmentsSql = `SELECT id, batch_id, tracking_number, partido, city, province, postal_code, assigned_carrier
        FROM shipments
        WHERE batch_id = ? AND shipping_method = 'flex'
        ORDER BY id DESC`;
      shipmentsArgs = [batchId];
    } else {
      const range = getDateRange(period, specificDate);
      shipmentsSql = `SELECT s.id, s.batch_id, s.tracking_number, s.partido, s.city, s.province, s.postal_code, s.assigned_carrier
        FROM shipments s
        JOIN daily_batches b ON s.batch_id = b.id
        WHERE b.date >= ? AND b.date <= ? AND s.shipping_method = 'flex'
        ORDER BY s.id DESC`;
      shipmentsArgs = [range.from, range.to];
    }

    const [shipmentsResult, mappingsResult] = await Promise.all([
      db.execute({ sql: shipmentsSql, args: shipmentsArgs }),
      db.execute("SELECT partido, carrier_name FROM zone_mappings"),
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
