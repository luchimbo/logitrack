import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/ensureDb";
import { requireWorkspaceActor } from "@/lib/auth";

export async function PATCH(request, { params }) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const actor = authResult.actor;
    const workspaceId = actor.workspaceId;
    const { id } = await params;
    const body = await request.json();
    const { status, comment } = body || {};

    const incidentResult = await db.execute({
      sql: "SELECT * FROM incidents WHERE id = ? AND workspace_id = ? LIMIT 1",
      args: [id, workspaceId],
    });
    if (!incidentResult.rows.length) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    const incident = incidentResult.rows[0];

    if (status && ["open", "in_progress", "resolved", "cancelled"].includes(status)) {
      const updates = ["status = ?"];
      const args = [status];

      if (status === "resolved" && incident.status !== "resolved") {
        updates.push("resolved_at = CURRENT_TIMESTAMP");
      }

      await db.execute({
        sql: `UPDATE incidents SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?`,
        args: [...args, id, workspaceId],
      });

      await db.execute({
        sql: `INSERT INTO operation_events (workspace_id, order_id, app_user_id, event_type, from_status, to_status, metadata_json)
          VALUES (?, ?, ?, 'incident_status_change', ?, ?, ?)`,
        args: [
          workspaceId,
          incident.order_id,
          actor.appUserId || null,
          incident.status,
          status,
          JSON.stringify({ incident_id: Number(id) }),
        ],
      });
    }

    if (comment && String(comment).trim()) {
      await db.execute({
        sql: `INSERT INTO incident_comments (workspace_id, incident_id, app_user_id, comment)
          VALUES (?, ?, ?, ?)`,
        args: [workspaceId, id, actor.appUserId || null, String(comment).trim()],
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating incident:", error);
    return NextResponse.json({ error: "Failed to update incident" }, { status: 500 });
  }
}

export async function GET(request, { params }) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const workspaceId = authResult.actor.workspaceId;
    const { id } = await params;

    const incidentResult = await db.execute({
      sql: "SELECT * FROM incidents WHERE id = ? AND workspace_id = ? LIMIT 1",
      args: [id, workspaceId],
    });
    if (!incidentResult.rows.length) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    const [commentsResult] = await Promise.all([
      db.execute({
        sql: "SELECT * FROM incident_comments WHERE incident_id = ? AND workspace_id = ? ORDER BY created_at ASC",
        args: [id, workspaceId],
      }),
    ]);

    return NextResponse.json({
      incident: incidentResult.rows[0],
      comments: commentsResult.rows,
    });
  } catch (error) {
    console.error("Error fetching incident detail:", error);
    return NextResponse.json({ error: "Failed to fetch incident" }, { status: 500 });
  }
}
