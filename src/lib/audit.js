import { db } from "@/lib/db";
import { ensureDb } from "@/lib/ensureDb";

function stringifyMetadata(metadata) {
  if (metadata == null) return null;
  try {
    return JSON.stringify(metadata);
  } catch {
    return null;
  }
}

export async function logAudit({
  workspaceId = null,
  appUserId = null,
  actorType,
  actorLabel = null,
  action,
  entityType = null,
  entityId = null,
  metadata = null,
}) {
  try {
    await ensureDb();
    await db.execute({
      sql: `INSERT INTO audit_logs (
        workspace_id, app_user_id, actor_type, actor_label, action, entity_type, entity_id, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        workspaceId,
        appUserId,
        actorType,
        actorLabel,
        action,
        entityType,
        entityId != null ? String(entityId) : null,
        stringifyMetadata(metadata),
      ],
    });
  } catch (error) {
    console.error("Audit log error:", error?.message || error);
  }
}
