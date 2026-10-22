// Esquema independiente: no alterar las migraciones de logística en curso.
export const REVIEWS_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS reviews_config (
    store_id TEXT PRIMARY KEY, revision TEXT NOT NULL, generated_at TEXT NOT NULL,
    published_at TEXT NOT NULL, snapshot_json TEXT NOT NULL)`,
];

export function createReviewsRepository(db) {
  let ready;
  const init = () => ready ||= db.batch(REVIEWS_SCHEMA_SQL, 'write').catch((error) => { ready = null; throw error; });
  async function get(storeId) {
    await init();
    const result = await db.execute({ sql: 'SELECT * FROM reviews_config WHERE store_id=?', args: [String(storeId)] });
    const row = result.rows[0];
    return row ? { storeId: row.store_id, revision: row.revision, generatedAt: row.generated_at,
      publishedAt: row.published_at, snapshot: JSON.parse(row.snapshot_json) } : null;
  }
  // Una publicación más vieja no pisa a una más nueva; repetir la misma es inocuo.
  async function save({ storeId, revision, snapshot, publishedAt }) {
    await init();
    const result = await db.execute({ sql: `INSERT INTO reviews_config (store_id,revision,generated_at,published_at,snapshot_json)
      VALUES(?,?,?,?,?) ON CONFLICT(store_id) DO UPDATE SET revision=excluded.revision, generated_at=excluded.generated_at,
      published_at=excluded.published_at, snapshot_json=excluded.snapshot_json
      WHERE reviews_config.generated_at<excluded.generated_at`,
    args: [String(storeId), revision, snapshot.generatedAt, publishedAt, JSON.stringify(snapshot)] });
    const saved = await get(storeId);
    if (!result.rowsAffected && saved?.revision !== revision) {
      const error = new Error('Publicación anterior a la que ya está en la tienda'); error.status = 409; throw error;
    }
    return saved;
  }
  return { get, save };
}
