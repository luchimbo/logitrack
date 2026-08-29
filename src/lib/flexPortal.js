import { getArgentinaDateString } from "@/lib/dateUtils";

export function normalizeCutoffTime(value) {
  const text = String(value || "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : null;
}

export function argentinaTime() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
}

export function publicationState({ date, cutoffTime, publishedAt }) {
  const today = getArgentinaDateString();
  if (date !== today || !cutoffTime || publishedAt || argentinaTime() >= cutoffTime) return "live";
  return "scheduled";
}

export async function getFlexPortalState(db, workspaceId, date = getArgentinaDateString()) {
  const [settings, publication, revision] = await Promise.all([
    db.execute({ sql: "SELECT flex_portal_cutoff_time FROM workspace_settings WHERE workspace_id = ? LIMIT 1", args: [workspaceId] }),
    db.execute({ sql: "SELECT published_at FROM flex_portal_publications WHERE workspace_id = ? AND date = ? LIMIT 1", args: [workspaceId, date] }),
    db.execute({ sql: "SELECT revision FROM flex_portal_revisions WHERE workspace_id = ? LIMIT 1", args: [workspaceId] }),
  ]);
  const cutoffTime = normalizeCutoffTime(settings.rows[0]?.flex_portal_cutoff_time);
  const publishedAt = publication.rows[0]?.published_at || null;
  return { date, cutoffTime, publishedAt, state: publicationState({ date, cutoffTime, publishedAt }), revision: Number(revision.rows[0]?.revision || 0) };
}

export async function bumpFlexPortalRevision(db, workspaceId) {
  await db.execute({ sql: "INSERT INTO flex_portal_revisions (workspace_id, revision, updated_at) VALUES (?, 1, CURRENT_TIMESTAMP) ON CONFLICT(workspace_id) DO UPDATE SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP", args: [workspaceId] });
}
