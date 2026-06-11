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

export async function saveIntegrationConnection({ workspaceId, provider, externalStoreId, displayName = '', config }) {
  await ensureDb();
  const resolvedExternalStoreId = String(externalStoreId || '').trim();
  if (!resolvedExternalStoreId) {
    throw new Error('externalStoreId es obligatorio');
  }

  const configJson = encrypt(JSON.stringify(config));
  const result = await db.execute({
    sql: `INSERT INTO workspace_integration_connections (
      workspace_id, provider, external_store_id, display_name, config_json, is_active, connected_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(workspace_id, provider, external_store_id) DO UPDATE SET
      display_name = excluded.display_name,
      config_json = excluded.config_json,
      is_active = 1,
      connected_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP`,
    args: [workspaceId, provider, resolvedExternalStoreId, displayName || resolvedExternalStoreId, configJson],
  });

  const existing = await db.execute({
    sql: `SELECT id FROM workspace_integration_connections
          WHERE workspace_id = ? AND provider = ? AND external_store_id = ? LIMIT 1`,
    args: [workspaceId, provider, resolvedExternalStoreId],
  });

  return Number(existing.rows?.[0]?.id || result.lastInsertRowid || 0);
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

function mapConnectionRow(row, includeConfig = false) {
  const item = {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    provider: row.provider,
    externalStoreId: row.external_store_id,
    displayName: row.display_name || row.external_store_id,
    connectedAt: row.connected_at,
    isActive: Boolean(row.is_active),
  };

  if (includeConfig) {
    item.config = JSON.parse(decrypt(row.config_json));
  }

  return item;
}

export async function listIntegrationConnections({ workspaceId, provider = '', includeConfig = false } = {}) {
  await ensureDb();
  const conditions = ['workspace_id = ?', 'is_active = 1'];
  const args = [workspaceId];
  if (provider) {
    conditions.push('provider = ?');
    args.push(provider);
  }

  const result = await db.execute({
    sql: `SELECT id, workspace_id, provider, external_store_id, display_name, config_json, connected_at, is_active
          FROM workspace_integration_connections
          WHERE ${conditions.join(' AND ')}
          ORDER BY provider ASC, display_name ASC`,
    args,
  });

  return (result.rows || []).map((row) => mapConnectionRow(row, includeConfig));
}

export async function listAllActiveIntegrationConnections({ provider = '', includeConfig = false } = {}) {
  await ensureDb();
  const conditions = ['is_active = 1'];
  const args = [];
  if (provider) {
    conditions.push('provider = ?');
    args.push(provider);
  }

  const result = await db.execute({
    sql: `SELECT id, workspace_id, provider, external_store_id, display_name, config_json, connected_at, is_active
          FROM workspace_integration_connections
          WHERE ${conditions.join(' AND ')}
          ORDER BY workspace_id ASC, provider ASC`,
    args,
  });

  return (result.rows || []).map((row) => {
    try {
      return mapConnectionRow(row, includeConfig);
    } catch (error) {
      console.error('Integration config decrypt error:', error.message || error);
      return null;
    }
  }).filter(Boolean);
}

export async function getIntegrationConnection({ workspaceId, provider, id, externalStoreId, includeConfig = true } = {}) {
  await ensureDb();
  const conditions = ['workspace_id = ?', 'provider = ?', 'is_active = 1'];
  const args = [workspaceId, provider];

  if (id) {
    conditions.push('id = ?');
    args.push(Number(id));
  } else if (externalStoreId) {
    conditions.push('external_store_id = ?');
    args.push(String(externalStoreId));
  } else {
    return null;
  }

  const result = await db.execute({
    sql: `SELECT id, workspace_id, provider, external_store_id, display_name, config_json, connected_at, is_active
          FROM workspace_integration_connections
          WHERE ${conditions.join(' AND ')}
          LIMIT 1`,
    args,
  });

  return result.rows.length ? mapConnectionRow(result.rows[0], includeConfig) : null;
}

export async function findIntegrationConnectionByStore({ provider, externalStoreId, includeConfig = true } = {}) {
  await ensureDb();
  const result = await db.execute({
    sql: `SELECT id, workspace_id, provider, external_store_id, display_name, config_json, connected_at, is_active
          FROM workspace_integration_connections
          WHERE provider = ? AND external_store_id = ? AND is_active = 1
          LIMIT 1`,
    args: [provider, String(externalStoreId || '')],
  });

  return result.rows.length ? mapConnectionRow(result.rows[0], includeConfig) : null;
}

export async function deleteIntegrationConnection({ workspaceId, provider, id, externalStoreId } = {}) {
  await ensureDb();
  const conditions = ['workspace_id = ?', 'provider = ?'];
  const args = [workspaceId, provider];

  if (id) {
    conditions.push('id = ?');
    args.push(Number(id));
  } else if (externalStoreId) {
    conditions.push('external_store_id = ?');
    args.push(String(externalStoreId));
  } else {
    throw new Error('id o externalStoreId es obligatorio');
  }

  await db.execute({
    sql: `DELETE FROM workspace_integration_connections WHERE ${conditions.join(' AND ')}`,
    args,
  });
}

export async function deleteIntegrationConnections({ workspaceId, provider }) {
  await ensureDb();
  await db.execute({
    sql: `DELETE FROM workspace_integration_connections WHERE workspace_id = ? AND provider = ?`,
    args: [workspaceId, provider],
  });
}

export async function findIntegrationByConfigValue({ provider, key, value }) {
  await ensureDb();
  const result = await db.execute({
    sql: `SELECT workspace_id, config_json, connected_at, is_active
          FROM workspace_integrations
          WHERE provider = ? AND is_active = 1`,
    args: [provider],
  });

  for (const row of result.rows || []) {
    try {
      const config = JSON.parse(decrypt(row.config_json));
      if (String(config?.[key] || '') === String(value || '')) {
        return {
          workspaceId: row.workspace_id,
          provider,
          config,
          connectedAt: row.connected_at,
          isActive: Boolean(row.is_active),
        };
      }
    } catch (error) {
      console.error('Integration config decrypt error:', error.message || error);
    }
  }

  return null;
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
