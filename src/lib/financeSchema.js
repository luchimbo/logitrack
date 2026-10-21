// Additive schema: no existing operational records are rewritten.
export const FINANCE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS carrier_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL,
    carrier_id INTEGER NOT NULL, zone TEXT NOT NULL, valid_from TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0), currency TEXT NOT NULL DEFAULT 'ARS',
    created_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, carrier_id, zone, valid_from))`,
  `CREATE TABLE IF NOT EXISTS shipment_finance (
    workspace_id INTEGER NOT NULL, connection_id INTEGER NOT NULL, shipment_id TEXT NOT NULL,
    costs_json TEXT, costs_synced_at TEXT, details_json TEXT, details_synced_at TEXT,
    sync_error TEXT, last_attempt_at TEXT, responsibility_json TEXT, pricing_json TEXT,
    PRIMARY KEY(workspace_id, connection_id, shipment_id))`,
  `CREATE TABLE IF NOT EXISTS carrier_settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL, carrier_id INTEGER NOT NULL,
    date_from TEXT NOT NULL, date_to TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft'
      CHECK(status IN ('draft','closed','paid')),
    total_cents INTEGER NOT NULL DEFAULT 0, created_by INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    closed_at TEXT, paid_at TEXT, payment_reference TEXT)`,
  `CREATE TABLE IF NOT EXISTS carrier_settlement_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, settlement_id INTEGER NOT NULL,
    workspace_id INTEGER NOT NULL, connection_id INTEGER NOT NULL, shipment_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0), snapshot_json TEXT NOT NULL,
    UNIQUE(workspace_id, shipment_id),
    FOREIGN KEY(settlement_id) REFERENCES carrier_settlements(id))`,
  `CREATE TABLE IF NOT EXISTS carrier_settlement_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, settlement_id INTEGER NOT NULL, workspace_id INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL, reason TEXT NOT NULL, created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(settlement_id) REFERENCES carrier_settlements(id))`,
  `CREATE TABLE IF NOT EXISTS ml_sync_retries (
    workspace_id INTEGER NOT NULL, connection_id INTEGER NOT NULL, order_id TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(workspace_id, connection_id, order_id))`,
  `CREATE INDEX IF NOT EXISTS idx_settlements_workspace ON carrier_settlements(workspace_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_retries_due ON ml_sync_retries(connection_id, next_attempt_at)`,
  `CREATE TABLE IF NOT EXISTS ml_notification_retries (
    notification_id INTEGER PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_error TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  // Precomputed lean copy of the finance records, so the map reads one small table instead of rebuilding everything.
  `CREATE TABLE IF NOT EXISTS finance_snapshot (
    workspace_id INTEGER NOT NULL, row_key TEXT NOT NULL, dispatch_day TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL,
    PRIMARY KEY(workspace_id, row_key))`,
  `CREATE INDEX IF NOT EXISTS idx_finance_snapshot_day ON finance_snapshot(workspace_id, dispatch_day)`,
  `CREATE TABLE IF NOT EXISTS finance_snapshot_meta (
    workspace_id INTEGER PRIMARY KEY, built_at TEXT NOT NULL, options_json TEXT NOT NULL)`,
];
