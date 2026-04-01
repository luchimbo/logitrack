import { db, hasDbCredentials } from "./db";

let _initialized = false;

function exec(sql, args = []) {
  return db.execute({ sql, args });
}

export async function initDb() {
  if (!hasDbCredentials) {
    _initialized = false;
    return false;
  }

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
    `CREATE TABLE IF NOT EXISTS app_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clerk_user_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS workspace_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      app_user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workspace_id, app_user_id),
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
      FOREIGN KEY(app_user_id) REFERENCES app_users(id)
    )`,
    `CREATE TABLE IF NOT EXISTS workspace_printers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      printer_path TEXT NOT NULL,
      sync_url TEXT,
      sync_token TEXT,
      workspace_key TEXT NOT NULL UNIQUE,
      is_default INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    )`,
    `CREATE TABLE IF NOT EXISTS workspace_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL UNIQUE,
      printing_setup_completed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    )`,
    `CREATE TABLE IF NOT EXISTS zone_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER,
      partido TEXT NOT NULL,
      carrier_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS carriers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT,
      color TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS daily_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER,
      date DATE DEFAULT CURRENT_DATE,
      total_packages INTEGER DEFAULT 0,
      filenames TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS print_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER,
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
      workspace_id INTEGER,
      print_job_id INTEGER NOT NULL,
      item_order INTEGER NOT NULL,
      sku TEXT,
      tracking_number TEXT,
      label_fingerprint TEXT,
      sale_id TEXT,
      product_name TEXT,
      shipping_method TEXT,
      raw_block TEXT,
      is_reprint INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(print_job_id) REFERENCES print_jobs(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_app_users_clerk ON app_users(clerk_user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(app_user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_workspace_printers_workspace ON workspace_printers(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_workspace_settings_workspace ON workspace_settings(workspace_id)`,
    `CREATE INDEX IF NOT EXISTS idx_print_job_items_job ON print_job_items(print_job_id)`,
    `CREATE INDEX IF NOT EXISTS idx_print_job_items_tracking ON print_job_items(tracking_number)`,
    `CREATE INDEX IF NOT EXISTS idx_print_job_items_fingerprint ON print_job_items(label_fingerprint)`,
    `CREATE INDEX IF NOT EXISTS idx_print_jobs_received ON print_jobs(received_at)`,
    `CREATE INDEX IF NOT EXISTS idx_shipments_workspace_created ON shipments(workspace_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_shipments_workspace_batch ON shipments(workspace_id, batch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_daily_batches_workspace_date ON daily_batches(workspace_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_zone_mappings_workspace_partido ON zone_mappings(workspace_id, partido)`,
    `CREATE INDEX IF NOT EXISTS idx_carriers_workspace_name ON carriers(workspace_id, name)`,
    `CREATE INDEX IF NOT EXISTS idx_print_jobs_workspace_received ON print_jobs(workspace_id, received_at)`,
    `CREATE INDEX IF NOT EXISTS idx_print_job_items_workspace_tracking ON print_job_items(workspace_id, tracking_number)`
  ];

  for (const stmt of statements) {
    try {
      await exec(stmt);
    } catch (e) {
      console.error("DB Init Error:", e.message || e);
    }
  }

  // Migration: add lat and lng to shipments
  try {
    const tableInfo = await exec("PRAGMA table_info(shipments)");
    const cols = tableInfo.rows.map(r => r.name);
    if (!cols.includes('lat')) {
      await exec("ALTER TABLE shipments ADD COLUMN lat FLOAT");
      await exec("ALTER TABLE shipments ADD COLUMN lng FLOAT");
      console.log("Migration: added lat and lng columns to shipments table");
    }
  } catch (e) {
    console.error("Migration error (lat/lng):", e.message || e);
  }

  // Migration: add raw_block to print_job_items
  try {
    await exec("ALTER TABLE print_job_items ADD COLUMN raw_block TEXT");
  } catch (e) {
    const msg = String(e?.message || "").toLowerCase();
    if (!msg.includes("duplicate column") && !msg.includes("already exists")) {
      console.error("Migration error (print_job_items.raw_block):", e.message || e);
    }
  }

  const addColumnIfMissing = async (tableName, columnName, sqlType) => {
    try {
      const tableInfo = await exec(`PRAGMA table_info(${tableName})`);
      const cols = tableInfo.rows.map((r) => r.name);
      if (!cols.includes(columnName)) {
        await exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlType}`);
      }
    } catch (e) {
      console.error(`Migration error (${tableName}.${columnName}):`, e.message || e);
    }
  };

  await addColumnIfMissing("shipments", "workspace_id", "INTEGER");
  await addColumnIfMissing("daily_batches", "workspace_id", "INTEGER");
  await addColumnIfMissing("zone_mappings", "workspace_id", "INTEGER");
  await addColumnIfMissing("carriers", "workspace_id", "INTEGER");
  await addColumnIfMissing("print_jobs", "workspace_id", "INTEGER");
  await addColumnIfMissing("print_job_items", "workspace_id", "INTEGER");

  let legacyWorkspaceId = null;
  try {
    const legacyWorkspace = await exec(
      "SELECT id FROM workspaces WHERE slug = ? LIMIT 1",
      ["legacy"]
    );

    if (legacyWorkspace.rows.length) {
      legacyWorkspaceId = Number(legacyWorkspace.rows[0].id);
    } else {
      const inserted = await exec("INSERT INTO workspaces (name, slug) VALUES (?, ?)", ["LogiTrack Legacy", "legacy"]);
      legacyWorkspaceId = Number(inserted.lastInsertRowid);
    }

    await exec("INSERT OR IGNORE INTO workspace_settings (workspace_id, printing_setup_completed) VALUES (?, 0)", [legacyWorkspaceId]);
  } catch (e) {
    console.error("Workspace seed error:", e.message || e);
  }

  if (legacyWorkspaceId) {
    try {
      const tablesToBackfill = [
        "shipments",
        "daily_batches",
        "zone_mappings",
        "carriers",
        "print_jobs",
        "print_job_items",
      ];

      for (const tableName of tablesToBackfill) {
        await exec(`UPDATE ${tableName} SET workspace_id = ? WHERE workspace_id IS NULL`, [legacyWorkspaceId]);
      }

      await exec(`UPDATE print_job_items SET workspace_id = (
          SELECT pj.workspace_id FROM print_jobs pj WHERE pj.id = print_job_items.print_job_id
        ) WHERE workspace_id IS NULL AND print_job_id IS NOT NULL`);
    } catch (e) {
      console.error("Workspace backfill error:", e.message || e);
    }
  }

  // Migration: remove UNIQUE constraint on zone_mappings.partido
  try {
    // Try inserting a duplicate to test if UNIQUE still exists
    // If the constraint exists, this will fail and we'll migrate
    await exec("SELECT COUNT(*) as cnt FROM zone_mappings");
    // Try the migration by checking table info
    const tableInfo = await exec("PRAGMA table_info(zone_mappings)");
    // Check if there's a unique index
    const indexes = await exec("PRAGMA index_list(zone_mappings)");
    const hasUnique = indexes.rows.some(r => r.unique === 1);

    if (hasUnique) {
      await exec("DROP TABLE IF EXISTS zone_mappings_new");
      await exec(`CREATE TABLE zone_mappings_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER,
        partido TEXT NOT NULL,
        carrier_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      await exec(`INSERT INTO zone_mappings_new (id, workspace_id, partido, carrier_name, created_at)
        SELECT id, workspace_id, partido, carrier_name, created_at FROM zone_mappings`);
      await exec("DROP TABLE zone_mappings");
      await exec("ALTER TABLE zone_mappings_new RENAME TO zone_mappings");
      console.log("Zone migration: removed UNIQUE constraint on partido");
    }
  } catch (e) {
    try { await exec("DROP TABLE IF EXISTS zone_mappings_new"); } catch (_) { }
    // Not critical — may already be migrated
  }

  // Migration: remove global UNIQUE constraint on carriers.name for workspace isolation
  try {
    const indexes = await exec("PRAGMA index_list(carriers)");
    const hasUnique = indexes.rows.some((r) => r.unique === 1);

    if (hasUnique) {
      await exec("DROP TABLE IF EXISTS carriers_new");
      await exec(`CREATE TABLE carriers_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER,
        name TEXT NOT NULL,
        display_name TEXT,
        color TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      await exec(`INSERT INTO carriers_new (id, workspace_id, name, display_name, color, created_at)
        SELECT id, workspace_id, name, display_name, color, created_at FROM carriers`);
      await exec("DROP TABLE carriers");
      await exec("ALTER TABLE carriers_new RENAME TO carriers");
      console.log("Carrier migration: removed global UNIQUE constraint on name");
    }
  } catch (e) {
    try { await exec("DROP TABLE IF EXISTS carriers_new"); } catch (_) { }
  }

  await addColumnIfMissing("zone_mappings", "workspace_id", "INTEGER");
  await addColumnIfMissing("carriers", "workspace_id", "INTEGER");

  // Migration: add role to users table and ensure admin role
  try {
    const tableInfo = await exec("PRAGMA table_info(users)");
    const cols = tableInfo.rows.map(r => r.name);

    if (!cols.includes('role')) {
      await exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
      console.log("Migration: added role column to users table");
    }

    await exec("UPDATE users SET role = 'admin' WHERE username = 'admin'");
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
        const exists = await exec("SELECT id FROM zone_mappings WHERE partido = ? AND carrier_name = ? LIMIT 1", [item.partido, item.carrier]);

      if (!exists.rows.length) {
          await exec("INSERT INTO zone_mappings (partido, carrier_name) VALUES (?, ?)", [item.partido, item.carrier]);
        }
      }

    const villaRosaExists = await exec("SELECT id FROM zone_mappings WHERE partido = ? LIMIT 1", ["villa_rosa"]);

    if (!villaRosaExists.rows.length) {
      const pilarCarrier = await exec("SELECT carrier_name FROM zone_mappings WHERE partido = ? ORDER BY id ASC LIMIT 1", ["pilar"]);

      if (pilarCarrier.rows.length && pilarCarrier.rows[0].carrier_name) {
        await exec("INSERT INTO zone_mappings (partido, carrier_name) VALUES (?, ?)", ["villa_rosa", pilarCarrier.rows[0].carrier_name]);
      }
    }

    const forcedEntregoYa = ["dique_lujan", "ingeniero_maschwitz", "la_plata", "campana", "zarate"];
    for (const partido of forcedEntregoYa) {
      await exec("UPDATE zone_mappings SET carrier_name = ? WHERE partido = ?", ["EntregoYa", partido]);

      const exists = await exec("SELECT id FROM zone_mappings WHERE partido = ? LIMIT 1", [partido]);

      if (!exists.rows.length) {
        await exec("INSERT INTO zone_mappings (partido, carrier_name) VALUES (?, ?)", [partido, "EntregoYa"]);
      }
    }
  } catch (e) {
    console.error("Zone seed error:", e.message || e);
  }

  // Seed default admin user and fix hash if needed
  try {
    const adminHash = '$2b$10$36jNNjQ/Ve39sS9a.yJ7MMmYKusO2maa7HKWAo39Ry'; // 123456
    const usersCount = await exec("SELECT COUNT(*) as cnt FROM users WHERE username = 'admin'");
    if (usersCount.rows[0].cnt === 0) {
      await exec("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", ['admin', adminHash, 'admin']);
      console.log("DB Init: Created default 'admin' user with password '123456'");
    } else {
      // Force update of password hash to correct one just in case it was deployed with the broken hash
      const brokenHash = '$2a$10$wE9KpxBvM6f69p6M.Q8Y6OYZ8T5X5Bq2f2T0P3aF9f/wM/8Fh1eP.';
      await exec("UPDATE users SET password_hash = ? WHERE username = 'admin' AND password_hash = ?", [adminHash, brokenHash]);
    }
  } catch (e) {
    console.error("User seed error:", e.message || e);
  }
}
