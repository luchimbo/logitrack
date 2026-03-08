import { db } from "./db";

let _initialized = false;

export async function initDb() {
  // if (_initialized) return;
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
      lat FLOAT,
      lng FLOAT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
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

  // Migration: add lat and lng to shipments
  try {
    const tableInfo = await db.execute("PRAGMA table_info(shipments)");
    const cols = tableInfo.rows.map(r => r.name);
    if (!cols.includes('lat')) {
      await db.execute("ALTER TABLE shipments ADD COLUMN lat FLOAT");
      await db.execute("ALTER TABLE shipments ADD COLUMN lng FLOAT");
      console.log("Migration: added lat and lng columns to shipments table");
    }
  } catch (e) {
    console.error("Migration error (lat/lng):", e.message || e);
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

  // Migration: add role to users table and ensure admin role
  try {
    const tableInfo = await db.execute("PRAGMA table_info(users)");
    const cols = tableInfo.rows.map(r => r.name);

    if (!cols.includes('role')) {
      await db.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
      console.log("Migration: added role column to users table");
    }

    await db.execute("UPDATE users SET role = 'admin' WHERE username = 'admin'");
  } catch (e) {
    console.error("Migration error (users.role):", e.message || e);
  }

  // Seed critical sub-zones for La Matanza split
  try {
    const requiredMappings = [
      { partido: "la_matanza_sur", carrier: "EntregoYa" },
      { partido: "la_matanza_norte", carrier: "Hormiga" },
    ];

    for (const item of requiredMappings) {
      const exists = await db.execute({
        sql: "SELECT id FROM zone_mappings WHERE partido = ? AND carrier_name = ? LIMIT 1",
        args: [item.partido, item.carrier],
      });

      if (!exists.rows.length) {
        await db.execute({
          sql: "INSERT INTO zone_mappings (partido, carrier_name) VALUES (?, ?)",
          args: [item.partido, item.carrier],
        });
      }
    }
  } catch (e) {
    console.error("Zone seed error:", e.message || e);
  }

  // Seed default admin user and fix hash if needed
  try {
    const adminHash = '$2b$10$36jNNjQ/Ve39sS9a.yJ7MMmYKusO2maa7HKWAo39Ry'; // 123456
    const usersCount = await db.execute("SELECT COUNT(*) as cnt FROM users WHERE username = 'admin'");
    if (usersCount.rows[0].cnt === 0) {
      await db.execute({
        sql: "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        args: ['admin', adminHash, 'admin']
      });
      console.log("DB Init: Created default 'admin' user with password '123456'");
    } else {
      // Force update of password hash to correct one just in case it was deployed with the broken hash
      const brokenHash = '$2a$10$wE9KpxBvM6f69p6M.Q8Y6OYZ8T5X5Bq2f2T0P3aF9f/wM/8Fh1eP.';
      await db.execute({
        sql: "UPDATE users SET password_hash = ? WHERE username = 'admin' AND password_hash = ?",
        args: [adminHash, brokenHash]
      });
    }
  } catch (e) {
    console.error("User seed error:", e.message || e);
  }
}
