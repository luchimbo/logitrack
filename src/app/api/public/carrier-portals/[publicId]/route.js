import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getReadOnlyDb } from "@/lib/readOnlyDb";
import { isValidCarrierPortalSecret } from "@/lib/carrierPortal";
import { getArgentinaDateString } from "@/lib/dateUtils";
import { getFlexPortalState } from "@/lib/flexPortal";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

function notFound() {
  return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: NO_STORE_HEADERS });
}

function getBearerToken(request) {
  const header = String(request.headers.get("authorization") || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function allowedDate(value) {
  const today = getArgentinaDateString();
  const todayDate = new Date(`${today}T12:00:00Z`);
  const oldestDate = new Date(todayDate);
  oldestDate.setUTCDate(oldestDate.getUTCDate() - 6);
  const oldest = oldestDate.toISOString().slice(0, 10);
  const date = value || today;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= oldest && date <= today ? date : null;
}

function normalizeStatus(status) {
  const value = String(status || "pendiente").trim().toLowerCase();
  return ["pendiente", "encontrado", "empaquetado", "despachado"].includes(value) ? value : "otros";
}

function portalData(rows, link, date) {
  const shipments = rows.map((row) => ({
    id: Number(row.id),
    trackingNumber: row.tracking_number || "",
    orderId: row.sale_id || "",
    productName: row.product_name || "Producto sin nombre",
    sku: row.sku || "",
    quantity: Number(row.quantity || 1),
    recipientName: row.recipient_name || "No informado",
    recipientPhone: row.recipient_phone || "",
    address: row.address || "No informada",
    reference: row.reference || "",
    city: row.city || "",
    partido: row.partido || "Sin zona",
    province: row.province || "",
    postalCode: row.postal_code || "",
    status: normalizeStatus(row.status),
  })).sort((a, b) => `${a.partido}|${a.city}|${a.recipientName}`.localeCompare(`${b.partido}|${b.city}|${b.recipientName}`, "es"));
  const byStatus = { pendiente: 0, encontrado: 0, empaquetado: 0, despachado: 0, otros: 0 };
  const zones = new Map();
  let units = 0;
  for (const shipment of shipments) {
    units += shipment.quantity;
    byStatus[shipment.status] += 1;
    const current = zones.get(shipment.partido) || { name: shipment.partido, packages: 0, units: 0 };
    current.packages += 1;
    current.units += shipment.quantity;
    zones.set(shipment.partido, current);
  }
  return {
    portal: { carrierName: link.display_name || link.name, carrierColor: link.color || "#0f766e", date, refreshedAt: new Date().toISOString() },
    summary: { packages: shipments.length, units, zones: zones.size, byStatus },
    zoneSummary: [...zones.values()].sort((a, b) => a.name.localeCompare(b.name, "es")),
    shipments,
  };
}

function filterShipments(data, params) {
  const zone = String(params.get("zone") || "").trim().toLowerCase();
  const status = String(params.get("status") || "").trim().toLowerCase();
  const search = String(params.get("search") || "").trim().toLowerCase();
  if (!zone && !status && !search) return data.shipments;
  return data.shipments.filter((shipment) => {
    if (zone && shipment.partido.toLowerCase() !== zone) return false;
    if (status && shipment.status !== status) return false;
    if (!search) return true;
    return [shipment.trackingNumber, shipment.orderId, shipment.productName, shipment.recipientName, shipment.address, shipment.city, shipment.partido]
      .join(" ").toLowerCase().includes(search);
  });
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvExport(data, shipments) {
  const header = ["Tracking", "Pedido", "Producto", "SKU", "Cantidad", "Destinatario", "Teléfono", "Dirección", "Referencia", "Localidad", "Partido", "Provincia", "CP", "Estado"];
  const lines = shipments.map((s) => [s.trackingNumber, s.orderId, s.productName, s.sku, s.quantity, s.recipientName, s.recipientPhone, s.address, s.reference, s.city, s.partido, s.province, s.postalCode, s.status].map(csvValue).join(","));
  return `\uFEFFPortal ${data.portal.carrierName} - ${data.portal.date}\n${header.join(",")}\n${lines.join("\n")}`;
}

async function pdfExport(data, shipments) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([595, 842]);
  let y = 800;
  const addLine = (text, size = 9, font = regular) => {
    if (y < 42) { page = document.addPage([595, 842]); y = 800; }
    const safeText = String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");
    page.drawText(safeText.slice(0, 112), { x: 34, y, size, font, color: rgb(0.08, 0.12, 0.16) });
    y -= size + 5;
  };
  addLine(`Portal de ${data.portal.carrierName}`, 17, bold);
  addLine(`Operación del ${data.portal.date} · ${shipments.length} paquetes`, 10);
  y -= 8;
  for (const shipment of shipments) {
    addLine(`${shipment.partido} · ${shipment.status.toUpperCase()} · ${shipment.quantity} u.`, 10, bold);
    addLine(`${shipment.productName} ${shipment.sku ? `(${shipment.sku})` : ""}`);
    addLine(`${shipment.recipientName} · ${shipment.recipientPhone || "Teléfono no informado"}`);
    addLine(`${shipment.address}, ${shipment.city} · CP ${shipment.postalCode}`);
    if (shipment.reference) addLine(`Referencia: ${shipment.reference}`);
    y -= 5;
  }
  return document.save();
}

export async function GET(request, { params }) {
  try {
    const { publicId } = await params;
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(publicId || ""))) return notFound();
    const db = getReadOnlyDb();
    const linkResult = await db.execute({
      sql: `SELECT l.id, l.workspace_id, l.carrier_id, l.public_id, l.active, c.name, c.display_name, c.color
            FROM carrier_portal_links l JOIN carriers c ON c.id = l.carrier_id AND c.workspace_id = l.workspace_id
            WHERE l.public_id = ? AND l.active = 1 LIMIT 1`,
      args: [publicId],
    });
    const link = linkResult.rows[0];
    if (!link || !isValidCarrierPortalSecret(link, getBearerToken(request))) return notFound();
    const searchParams = new URL(request.url).searchParams;
    const date = allowedDate(searchParams.get("date"));
    if (!date) return NextResponse.json({ error: "La fecha debe estar entre hoy y los últimos 6 días" }, { status: 400, headers: NO_STORE_HEADERS });
    const publication = await getFlexPortalState(db, link.workspace_id, date);
    const since = Number(searchParams.get("revision"));
    if (Number.isFinite(since) && since === publication.revision && publication.state === "live") {
      return new NextResponse(null, { status: 304, headers: NO_STORE_HEADERS });
    }
    if (publication.state === "scheduled") {
      return NextResponse.json({ portal: { carrierName: link.display_name || link.name, carrierColor: link.color || "#0f766e", date, refreshedAt: new Date().toISOString() }, publication, summary: { packages: 0, units: 0, zones: 0, byStatus: {} }, zoneSummary: [], shipments: [] }, { headers: NO_STORE_HEADERS });
    }
    const shipmentsResult = await db.execute({
      sql: `SELECT s.id, s.tracking_number, s.sale_id, s.product_name, s.sku, s.quantity, s.recipient_name,
              COALESCE(NULLIF(s.recipient_phone, ''), NULLIF(mo.recipient_phone, '')) AS recipient_phone,
              s.address, s.reference, s.city, s.partido, s.province, s.postal_code, s.status
            FROM shipments s
            JOIN daily_batches b ON b.id = s.batch_id AND b.workspace_id = s.workspace_id
            LEFT JOIN mercadolibre_orders mo ON mo.workspace_id = s.workspace_id AND mo.shipment_id = s.external_shipment_id
            WHERE s.workspace_id = ? AND s.shipping_method = 'flex' AND s.assigned_carrier = ? AND b.date = ?
            ORDER BY s.partido, s.city, s.recipient_name, s.id`,
      args: [link.workspace_id, link.name, date],
    });
    const data = { ...portalData(shipmentsResult.rows || [], link, date), publication };
    const shipments = filterShipments(data, searchParams);
    const format = searchParams.get("format") || "json";
    if (format === "csv") return new NextResponse(csvExport(data, shipments), { headers: { ...NO_STORE_HEADERS, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="portal-${date}.csv"` } });
    if (format === "pdf") return new NextResponse(await pdfExport(data, shipments), { headers: { ...NO_STORE_HEADERS, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="portal-${date}.pdf"` } });
    if (format !== "json") return NextResponse.json({ error: "Formato inválido" }, { status: 400, headers: NO_STORE_HEADERS });
    return NextResponse.json(data, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Public carrier portal error:", error?.message || error);
    return NextResponse.json({ error: "No se pudo cargar el portal" }, { status: 503, headers: NO_STORE_HEADERS });
  }
}

export function POST() { return NextResponse.json({ error: "Método no permitido" }, { status: 405, headers: NO_STORE_HEADERS }); }
export function PUT() { return NextResponse.json({ error: "Método no permitido" }, { status: 405, headers: NO_STORE_HEADERS }); }
export function PATCH() { return NextResponse.json({ error: "Método no permitido" }, { status: 405, headers: NO_STORE_HEADERS }); }
export function DELETE() { return NextResponse.json({ error: "Método no permitido" }, { status: 405, headers: NO_STORE_HEADERS }); }
