// Persistencia idempotente del informe; compartida por eventos y conciliación.
export function createOnlineOrderRepository(db) {
  let ready;
  async function initialize() {
    await db.batch([
      `CREATE TABLE IF NOT EXISTS crossselling_online_orders (store_id TEXT NOT NULL, order_id TEXT NOT NULL, number TEXT,
        created_at TEXT NOT NULL, total REAL NOT NULL, paid INTEGER NOT NULL, cancelled INTEGER NOT NULL, updated_at TEXT NOT NULL,
        source_updated_at TEXT NOT NULL DEFAULT '', PRIMARY KEY(store_id, order_id))`,
      `CREATE TABLE IF NOT EXISTS crossselling_online_sales (store_id TEXT NOT NULL, order_id TEXT NOT NULL, variant_id TEXT NOT NULL,
        rule_id TEXT NOT NULL, product_name TEXT, quantity INTEGER NOT NULL, revenue REAL NOT NULL, discount REAL NOT NULL,
        PRIMARY KEY(store_id, order_id, variant_id))`,
      `CREATE TABLE IF NOT EXISTS crossselling_online_sync (store_id TEXT PRIMARY KEY, last_success_at TEXT,
        lease_until TEXT, lease_id TEXT, last_error TEXT, result_json TEXT)`,
    ], 'write');
    const columns = await db.execute('PRAGMA table_info(crossselling_online_orders)');
    if (!columns.rows.some((r) => r.name === 'source_updated_at')) {
      try { await db.execute("ALTER TABLE crossselling_online_orders ADD COLUMN source_updated_at TEXT NOT NULL DEFAULT ''"); }
      catch (error) { if (!/duplicate column/i.test(error.message)) throw error; }
    }
  }
  const init = () => ready ||= initialize().catch((e) => { ready = null; throw e; });
  async function save(storeId, summary, sales, sourceUpdatedAt) {
    await init();
    // El lote es atómico. Una lectura antigua no puede pisar un pago/cancelación posterior.
    const guard = 'EXISTS (SELECT 1 FROM crossselling_online_orders o WHERE o.store_id=? AND o.order_id=? AND o.source_updated_at=?)';
    const guardArgs = [storeId, summary.orderId, sourceUpdatedAt];
    const result = await db.batch([
      { sql: `INSERT INTO crossselling_online_orders
        (store_id,order_id,number,created_at,total,paid,cancelled,updated_at,source_updated_at) VALUES(?,?,?,?,?,?,?,?,?)
        ON CONFLICT(store_id,order_id) DO UPDATE SET number=excluded.number, created_at=excluded.created_at,
        total=excluded.total, paid=excluded.paid, cancelled=excluded.cancelled, updated_at=excluded.updated_at,
        source_updated_at=excluded.source_updated_at WHERE excluded.source_updated_at>=crossselling_online_orders.source_updated_at`,
      args: [storeId, summary.orderId, summary.number, summary.createdAt, summary.total, summary.paid ? 1 : 0,
        summary.cancelled ? 1 : 0, new Date().toISOString(), sourceUpdatedAt] },
      { sql: `DELETE FROM crossselling_online_sales WHERE store_id=? AND order_id=? AND ${guard}`, args: [storeId, summary.orderId, ...guardArgs] },
      ...sales.map((r) => ({ sql: `INSERT INTO crossselling_online_sales
        (store_id,order_id,variant_id,rule_id,product_name,quantity,revenue,discount) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`,
      args: [storeId, summary.orderId, r.variantId, r.ruleId, r.productName, r.quantity, r.revenue, r.discount, ...guardArgs] })),
    ], 'write');
    return Boolean(result[0].rowsAffected);
  }
  async function syncState(storeId) {
    await init();
    return (await db.execute({ sql: 'SELECT * FROM crossselling_online_sync WHERE store_id=?', args: [storeId] })).rows[0] || null;
  }
  async function acquire(storeId, leaseId, now, until) {
    await init();
    const r = await db.execute({ sql: `INSERT INTO crossselling_online_sync(store_id,lease_id,lease_until) VALUES(?,?,?)
      ON CONFLICT(store_id) DO UPDATE SET lease_id=excluded.lease_id,lease_until=excluded.lease_until
      WHERE crossselling_online_sync.lease_until IS NULL OR crossselling_online_sync.lease_until<=?`, args: [storeId, leaseId, until, now] });
    return Boolean(r.rowsAffected);
  }
  async function finish(storeId, leaseId, at, result, error = null) {
    await db.execute({ sql: `UPDATE crossselling_online_sync SET lease_until=NULL, lease_id=NULL,
      last_success_at=CASE WHEN ? IS NULL THEN ? ELSE last_success_at END, last_error=?, result_json=? WHERE store_id=? AND lease_id=?`,
    args: [error, at, error, JSON.stringify(result), storeId, leaseId] });
  }
  return { init, save, syncState, acquire, finish };
}
