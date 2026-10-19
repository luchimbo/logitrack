// Esquema independiente: no alterar las migraciones de logística en curso.
export const CROSSSELLING_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS crossselling_config (
    store_id TEXT PRIMARY KEY, workspace_id INTEGER NOT NULL, revision TEXT NOT NULL,
    generated_at TEXT NOT NULL, published_at TEXT NOT NULL, snapshot_json TEXT NOT NULL,
    catalog_json TEXT NOT NULL, diagnostics_json TEXT NOT NULL)`,
];

export function createCrossSellingRepository(db) {
  let ready;
  const init = () => ready ||= db.batch(CROSSSELLING_SCHEMA, 'write').catch((error) => { ready = null; throw error; });
  async function get(storeId) {
    await init();
    const result = await db.execute({ sql: 'SELECT * FROM crossselling_config WHERE store_id=?', args: [String(storeId)] });
    const row = result.rows[0];
    return row ? { storeId: row.store_id, workspaceId: Number(row.workspace_id), revision: row.revision,
      generatedAt: row.generated_at, publishedAt: row.published_at, snapshot: JSON.parse(row.snapshot_json),
      catalog: JSON.parse(row.catalog_json), diagnostics: JSON.parse(row.diagnostics_json) } : null;
  }
  async function save({ storeId, workspaceId, revision, snapshot, catalog, diagnostics, publishedAt }) {
    await init();
    const result = await db.execute({ sql: `INSERT INTO crossselling_config
      (store_id,workspace_id,revision,generated_at,published_at,snapshot_json,catalog_json,diagnostics_json)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(store_id) DO UPDATE SET
      revision=excluded.revision, generated_at=excluded.generated_at, published_at=excluded.published_at,
      snapshot_json=excluded.snapshot_json, catalog_json=excluded.catalog_json, diagnostics_json=excluded.diagnostics_json
      WHERE crossselling_config.workspace_id=excluded.workspace_id AND crossselling_config.generated_at<excluded.generated_at`,
    args: [String(storeId), workspaceId, revision, snapshot.generatedAt, publishedAt, JSON.stringify(snapshot), JSON.stringify(catalog), JSON.stringify(diagnostics)] });
    const saved = await get(storeId);
    if (!result.rowsAffected && (saved?.workspaceId !== workspaceId || saved?.revision !== revision)) {
      const error = new Error('Publicación anterior o tienda asociada a otro espacio'); error.status = 409; throw error;
    }
    return saved;
  }
  return { get, save };
}
