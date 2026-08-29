import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/ensureDb";
import { requireWorkspaceAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { bumpFlexPortalRevision, getFlexPortalState, normalizeCutoffTime } from "@/lib/flexPortal";
import { getArgentinaDateString } from "@/lib/dateUtils";

async function actorFor(request) { await ensureDb(); return requireWorkspaceAdmin(request); }

export async function GET(request) {
  const auth = await actorFor(request); if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
  return NextResponse.json(await getFlexPortalState(db, auth.actor.workspaceId));
}

export async function PATCH(request) {
  try {
    const auth = await actorFor(request); if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const body = await request.json().catch(() => ({}));
    const raw = body.cutoffTime;
    const cutoffTime = normalizeCutoffTime(raw);
    if (raw && !cutoffTime) return NextResponse.json({ error: "Ingresá una hora válida (HH:mm)" }, { status: 400 });
    await db.execute({ sql: "INSERT INTO workspace_settings (workspace_id, flex_portal_cutoff_time) VALUES (?, ?) ON CONFLICT(workspace_id) DO UPDATE SET flex_portal_cutoff_time = excluded.flex_portal_cutoff_time", args: [auth.actor.workspaceId, cutoffTime] });
    await bumpFlexPortalRevision(db, auth.actor.workspaceId);
    await logAudit({ workspaceId: auth.actor.workspaceId, appUserId: auth.actor.appUserId, actorType: auth.actor.authType, actorLabel: auth.actor.email || auth.actor.username, action: "flex_portal_cutoff_updated", entityType: "workspace", entityId: auth.actor.workspaceId, metadata: { cutoffTime } });
    return NextResponse.json(await getFlexPortalState(db, auth.actor.workspaceId));
  } catch (error) { return NextResponse.json({ error: "No se pudo guardar el horario" }, { status: 500 }); }
}

export async function POST(request) {
  try {
    const auth = await actorFor(request); if (auth.error) return NextResponse.json(auth.error.body, { status: auth.error.status });
    const date = getArgentinaDateString();
    await db.execute({ sql: "INSERT INTO flex_portal_publications (workspace_id, date, published_at, published_by_app_user_id, reason) VALUES (?, ?, CURRENT_TIMESTAMP, ?, 'manual') ON CONFLICT(workspace_id, date) DO UPDATE SET published_at = CURRENT_TIMESTAMP, published_by_app_user_id = excluded.published_by_app_user_id, reason = 'manual'", args: [auth.actor.workspaceId, date, auth.actor.appUserId] });
    await bumpFlexPortalRevision(db, auth.actor.workspaceId);
    await logAudit({ workspaceId: auth.actor.workspaceId, appUserId: auth.actor.appUserId, actorType: auth.actor.authType, actorLabel: auth.actor.email || auth.actor.username, action: "flex_portal_published_early", entityType: "workspace", entityId: auth.actor.workspaceId, metadata: { date } });
    return NextResponse.json(await getFlexPortalState(db, auth.actor.workspaceId));
  } catch { return NextResponse.json({ error: "No se pudo publicar la operación" }, { status: 500 }); }
}
