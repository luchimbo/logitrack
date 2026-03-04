import { db } from "./db";

export async function initDb() {
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
      partido TEXT NOT NULL UNIQUE,
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
    )`
    ];

    for (const stmt of statements) {
        try {
            await db.execute(stmt);
        } catch (e) {
            console.error("DB Init Error:", e);
        }
    }
}
