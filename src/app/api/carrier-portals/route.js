import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/ensureDb";
import { requireWorkspaceAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { buildCarrierPortalUrl, createCarrierPortalPublicId } from "@/lib/carrierPortal";

function getOrigin(request) {
  return String(process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "");
}

function assertSigningConfigured() {
  buildCarrierPortalUrl({ origin: "https://portal.invalid", publicId: "configuration-check", workspaceId: 1, carrierId: 1 });
}

function linkDto(link, origin) {
  const base = {
    id: Number(link.id),
    carrier_id: Number(link.carrier_id),
    public_id: link.public_id,
    active: Boolean(link.active),
    created_at: link.created_at,
    rotated_at: link.rotated_at,
    revoked_at: link.revoked_at,
  };
  if (!base.active) return { ...base, url: null };
  return {
    ...base,
    url: buildCarrierPortalUrl({
      origin,
      publicId: link.public_id,
      workspaceId: Number(link.workspace_id),
      carrierId: Number(link.carrier_id),
    }),
  };
}

async function getCarrier(workspaceId, carrierId) {
  const result = await db.execute({
    sql: "SELECT id, name, display_name, color FROM carriers WHERE id = ? AND workspace_id = ? LIMIT 1",
    args: [Number(carrierId), workspaceId],
  });
  return result.rows[0] || null;
}

export async function GET(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    const workspaceId = authResult.actor.workspaceId;
    const result = await db.execute({
      sql: `SELECT c.id AS carrier_id, c.name, c.display_name, c.color,
              l.id, l.workspace_id, l.public_id, l.active, l.created_at, l.rotated_at, l.revoked_at
            FROM carriers c
            LEFT JOIN carrier_portal_links l ON l.carrier_id = c.id AND l.workspace_id = c.workspace_id
            WHERE c.workspace_id = ? ORDER BY c.name`,
      args: [workspaceId],
    });
    const origin = getOrigin(request);
    return NextResponse.json(result.rows.map((row) => ({
      carrier_id: Number(row.carrier_id),
      name: row.name,
      display_name: row.display_name || row.name,
      color: row.color,
      portal: row.id ? linkDto(row, origin) : null,
    })));
  } catch (error) {
    console.error("Carrier portal listing error:", error);
    return NextResponse.json({ error: "No se pudieron cargar los enlaces externos" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    const body = await request.json().catch(() => ({}));
    const carrierId = Number(body.carrierId);
    if (!Number.isInteger(carrierId) || carrierId <= 0) return NextResponse.json({ error: "Transportista inválido" }, { status: 400 });
    const workspaceId = authResult.actor.workspaceId;
    assertSigningConfigured();
    const carrier = await getCarrier(workspaceId, carrierId);
    if (!carrier) return NextResponse.json({ error: "Transportista no encontrado" }, { status: 404 });

    const existing = await db.execute({ sql: "SELECT * FROM carrier_portal_links WHERE workspace_id = ? AND carrier_id = ? LIMIT 1", args: [workspaceId, carrierId] });
    let link = existing.rows[0];
    if (!link || !Number(link.active)) {
      const publicId = createCarrierPortalPublicId();
      if (link) {
        await db.execute({ sql: "UPDATE carrier_portal_links SET public_id = ?, active = 1, rotated_at = CURRENT_TIMESTAMP, revoked_at = NULL WHERE id = ?", args: [publicId, link.id] });
      } else {
        await db.execute({ sql: "INSERT INTO carrier_portal_links (workspace_id, carrier_id, public_id, active) VALUES (?, ?, ?, 1)", args: [workspaceId, carrierId, publicId] });
      }
      const refreshed = await db.execute({ sql: "SELECT * FROM carrier_portal_links WHERE workspace_id = ? AND carrier_id = ? LIMIT 1", args: [workspaceId, carrierId] });
      link = refreshed.rows[0];
      await logAudit({ workspaceId, appUserId: authResult.actor.appUserId, actorType: authResult.actor.authType, actorLabel: authResult.actor.email || authResult.actor.username, action: "carrier_portal_enabled", entityType: "carrier", entityId: carrierId });
    }
    return NextResponse.json({ carrier, portal: linkDto(link, getOrigin(request)) });
  } catch (error) {
    console.error("Carrier portal creation error:", error);
    return NextResponse.json({ error: "No se pudo crear el enlace externo" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    const body = await request.json().catch(() => ({}));
    const carrierId = Number(body.carrierId);
    const action = body.action;
    if (!Number.isInteger(carrierId) || !["rotate", "revoke"].includes(action)) return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
    const workspaceId = authResult.actor.workspaceId;
    if (action === "rotate") assertSigningConfigured();
    const existing = await db.execute({ sql: "SELECT * FROM carrier_portal_links WHERE workspace_id = ? AND carrier_id = ? LIMIT 1", args: [workspaceId, carrierId] });
    const link = existing.rows[0];
    if (!link) return NextResponse.json({ error: "El transportista no tiene enlace externo" }, { status: 404 });
    if (action === "rotate") {
      await db.execute({ sql: "UPDATE carrier_portal_links SET public_id = ?, active = 1, rotated_at = CURRENT_TIMESTAMP, revoked_at = NULL WHERE id = ?", args: [createCarrierPortalPublicId(), link.id] });
    } else {
      await db.execute({ sql: "UPDATE carrier_portal_links SET active = 0, revoked_at = CURRENT_TIMESTAMP WHERE id = ?", args: [link.id] });
    }
    const refreshed = await db.execute({ sql: "SELECT * FROM carrier_portal_links WHERE id = ? LIMIT 1", args: [link.id] });
    await logAudit({ workspaceId, appUserId: authResult.actor.appUserId, actorType: authResult.actor.authType, actorLabel: authResult.actor.email || authResult.actor.username, action: `carrier_portal_${action}`, entityType: "carrier", entityId: carrierId });
    return NextResponse.json({ portal: linkDto(refreshed.rows[0], getOrigin(request)) });
  } catch (error) {
    console.error("Carrier portal update error:", error);
    return NextResponse.json({ error: "No se pudo actualizar el enlace externo" }, { status: 500 });
  }
}
