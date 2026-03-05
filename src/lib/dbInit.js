import { db } from "./db";

let _initialized = false;

export async function initDb() {
  if (_initialized) return;
  _initialized = true;

  const statements = [
    `CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER,
      sale_type TEXT,
      sale_id TEXT,
      tracking_number TEXT,
      remitente_id TEXT,
      product_name TEXT NOT NULL,
      sku TEXT,
      color TEXT,
      voltage TEXT,
      quantity INTEGER DEFAULT 1,
      recipient_name TEXT,
      recipient_user TEXT,
      address TEXT,
      postal_code TEXT,
      city TEXT,
      partido TEXT,
      province TEXT,
      reference TEXT,
      shipping_method TEXT,
      carrier_code TEXT,
      carrier_name TEXT,
      assigned_carrier TEXT,
      dispatch_date TEXT,
      delivery_date TEXT,
      status TEXT DEFAULT 'pendiente',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS zone_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partido TEXT NOT NULL,
      carrier_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS carriers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT,
      color TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS daily_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE DEFAULT CURRENT_DATE,
      total_packages INTEGER DEFAULT 0,
      filenames TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS print_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL UNIQUE,
      created_at_client TEXT,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      source_files_json TEXT,
      sku_order_json TEXT,
      printer_path TEXT,
      print_file_path TEXT,
      labels_total INTEGER DEFAULT 0,
      skus_total INTEGER DEFAULT 0,
      reprints_total INTEGER DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS print_job_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      print_job_id INTEGER NOT NULL,
      item_order INTEGER NOT NULL,
      sku TEXT,
      tracking_number TEXT,
      label_fingerprint TEXT,
      sale_id TEXT,
      product_name TEXT,
      shipping_method TEXT,
      is_reprint INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(print_job_id) REFERENCES print_jobs(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_print_job_items_job ON print_job_items(print_job_id)`,
    `CREATE INDEX IF NOT EXISTS idx_print_job_items_tracking ON print_job_items(tracking_number)`,
    `CREATE INDEX IF NOT EXISTS idx_print_job_items_fingerprint ON print_job_items(label_fingerprint)`,
    `CREATE INDEX IF NOT EXISTS idx_print_jobs_received ON print_jobs(received_at)`
  ];

  for (const stmt of statements) {
    try {
      await db.execute(stmt);
    } catch (e) {
      console.error("DB Init Error:", e.message || e);
    }
  }

  // Migration: remove UNIQUE constraint on zone_mappings.partido
  try {
    // Try inserting a duplicate to test if UNIQUE still exists
    // If the constraint exists, this will fail and we'll migrate
    const testResult = await db.execute(
      "SELECT COUNT(*) as cnt FROM zone_mappings"
    );
    // Try the migration by checking table info
    const tableInfo = await db.execute("PRAGMA table_info(zone_mappings)");
    // Check if there's a unique index
    const indexes = await db.execute("PRAGMA index_list(zone_mappings)");
    const hasUnique = indexes.rows.some(r => r.unique === 1);

    if (hasUnique) {
      await db.execute("DROP TABLE IF EXISTS zone_mappings_new");
      await db.execute(`CREATE TABLE zone_mappings_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        partido TEXT NOT NULL,
        carrier_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.execute(`INSERT INTO zone_mappings_new (id, partido, carrier_name, created_at)
        SELECT id, partido, carrier_name, created_at FROM zone_mappings`);
      await db.execute("DROP TABLE zone_mappings");
      await db.execute("ALTER TABLE zone_mappings_new RENAME TO zone_mappings");
      console.log("Zone migration: removed UNIQUE constraint on partido");
    }
  } catch (e) {
    try { await db.execute("DROP TABLE IF EXISTS zone_mappings_new"); } catch (_) { }
    // Not critical — may already be migrated
  }
}
