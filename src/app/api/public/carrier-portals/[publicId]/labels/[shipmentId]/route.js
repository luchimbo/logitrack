import { NextResponse } from "next/server";
import { getReadOnlyDb } from "@/lib/readOnlyDb";
import { isValidCarrierPortalSecret } from "@/lib/carrierPortal";
import { extractLabelDimensionsInches } from "@/lib/labelDimensions";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function notFound(error = "No encontrado") {
  return NextResponse.json({ error }, { status: 404, headers: NO_STORE_HEADERS });
}

function getBearerToken(request) {
  const header = String(request.headers.get("authorization") || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export async function GET(request, { params }) {
  try {
    const { publicId, shipmentId } = await params;
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(publicId || ""))) return notFound();
    const db = getReadOnlyDb();
    const linkResult = await db.execute({
      sql: `SELECT l.id, l.workspace_id, l.carrier_id, l.public_id, l.active, c.name AS carrier_name
            FROM carrier_portal_links l
            JOIN carriers c ON c.id = l.carrier_id AND c.workspace_id = l.workspace_id
            WHERE l.public_id = ? AND l.active = 1 LIMIT 1`,
      args: [publicId],
    });
    const link = linkResult.rows[0];
    if (!link || !isValidCarrierPortalSecret(link, getBearerToken(request))) return notFound();
    const shipmentResult = await db.execute({
      sql: `SELECT raw_zpl
            FROM shipments
            WHERE id = ? AND workspace_id = ? AND shipping_method = 'flex' AND assigned_carrier = ?
            LIMIT 1`,
      args: [String(shipmentId || ""), link.workspace_id, link.carrier_name],
    });
    const rawZpl = shipmentResult.rows[0]?.raw_zpl;
    if (!rawZpl) return notFound("sin_etiqueta");
    const dims = extractLabelDimensionsInches(rawZpl);
    const labelaryUrl = `https://api.labelary.com/v1/printers/8dpmm/labels/${dims.width}x${dims.height}/0/`;
    const attemptHeaders = [
      { Accept: "image/png", "Content-Type": "application/x-www-form-urlencoded" },
      { Accept: "image/png", "Content-Type": "text/plain" },
    ];
    let response = null;
    for (const headers of attemptHeaders) {
      response = await fetch(labelaryUrl, { method: "POST", headers, body: rawZpl });
      if (response.ok || response.status !== 415) break;
    }
    if (!response.ok) {
      const errorText = await response.text().catch(() => "error desconocido");
      console.error("Public label render error:", errorText);
      return NextResponse.json({ error: `Labelary: ${errorText}` }, { status: 502, headers: NO_STORE_HEADERS });
    }
    return new NextResponse(await response.arrayBuffer(), {
      headers: { ...NO_STORE_HEADERS, "Content-Type": "image/png" },
    });
  } catch (error) {
    console.error("Public carrier label error:", error?.message || error);
    return NextResponse.json({ error: "No se pudo cargar la etiqueta" }, { status: 503, headers: NO_STORE_HEADERS });
  }
}

function methodNotAllowed() {
  return NextResponse.json({ error: "Método no permitido" }, { status: 405, headers: NO_STORE_HEADERS });
}
export function POST() { return methodNotAllowed(); }
export function PUT() { return methodNotAllowed(); }
export function PATCH() { return methodNotAllowed(); }
export function DELETE() { return methodNotAllowed(); }
