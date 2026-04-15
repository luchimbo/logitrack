import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { encrypt, decrypt } from '@/lib/cryptoUtils';

export async function saveIntegration({ workspaceId, provider, config }) {
  await ensureDb();
  const configJson = encrypt(JSON.stringify(config));
  await db.execute({
    sql: `INSERT INTO workspace_integrations (
      workspace_id, provider, config_json, is_active, connected_at, updated_at
    ) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(workspace_id, provider) DO UPDATE SET
      config_json = excluded.config_json,
      is_active = 1,
      connected_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP`,
    args: [workspaceId, provider, configJson],
  });
}

export async function getIntegration({ workspaceId, provider }) {
  await ensureDb();
  const result = await db.execute({
    sql: `SELECT config_json, connected_at, is_active
          FROM workspace_integrations
          WHERE workspace_id = ? AND provider = ? AND is_active = 1
          LIMIT 1`,
    args: [workspaceId, provider],
  });
  if (!result.rows.length) return null;
  const row = result.rows[0];
  const config = JSON.parse(decrypt(row.config_json));
  return {
    workspaceId,
    provider,
    config,
    connectedAt: row.connected_at,
    isActive: Boolean(row.is_active),
  };
}

export async function getIntegrationMeta({ workspaceId, provider }) {
  await ensureDb();
  const result = await db.execute({
    sql: `SELECT connected_at, is_active
          FROM workspace_integrations
          WHERE workspace_id = ? AND provider = ?
          LIMIT 1`,
    args: [workspaceId, provider],
  });
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {
    workspaceId,
    provider,
    connectedAt: row.connected_at,
    isActive: Boolean(row.is_active),
  };
}

export async function deleteIntegration({ workspaceId, provider }) {
  await ensureDb();
  await db.execute({
    sql: `DELETE FROM workspace_integrations WHERE workspace_id = ? AND provider = ?`,
    args: [workspaceId, provider],
  });
}

export async function listIntegrationsMeta(workspaceId) {
  await ensureDb();
  const result = await db.execute({
    sql: `SELECT provider, connected_at, is_active
          FROM workspace_integrations
          WHERE workspace_id = ?
          ORDER BY provider ASC`,
    args: [workspaceId],
  });
  return (result.rows || []).map((row) => ({
    workspaceId,
    provider: row.provider,
    connectedAt: row.connected_at,
    isActive: Boolean(row.is_active),
  }));
}
