export const financeStatements = [
  `CREATE TABLE IF NOT EXISTS carrier_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL,
    carrier_name TEXT NOT NULL, zone TEXT NOT NULL, effective_from TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0), created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, carrier_name, zone, effective_from)
  )`,
  `CREATE TABLE IF NOT EXISTS flex_delivery_charges (
    workspace_id INTEGER NOT NULL, package_key TEXT NOT NULL, carrier_name TEXT NOT NULL,
    zone TEXT NOT NULL, delivery_date TEXT NOT NULL, rate_id INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(workspace_id, package_key)
  )`,
  `CREATE TABLE IF NOT EXISTS ml_shipping_costs (
    workspace_id INTEGER NOT NULL, connection_id INTEGER NOT NULL, shipment_id TEXT NOT NULL,
    amount_cents INTEGER, raw_json TEXT NOT NULL, synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(workspace_id, connection_id, shipment_id)
  )`,
];
