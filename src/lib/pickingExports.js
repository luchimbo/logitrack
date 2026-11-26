import { formatArgentinaDateTime, getArgentinaDateString } from './dateUtils.js';
import { groupPickingProducts } from './mercadoLibrePicking.js';

const schema = [
    `CREATE TABLE IF NOT EXISTS picking_exports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL,
        operation_date TEXT NOT NULL,
        snapshot_json TEXT NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_picking_exports_workspace ON picking_exports(workspace_id, id DESC)',
    `CREATE TABLE IF NOT EXISTS picking_exported_shipments (
        workspace_id INTEGER NOT NULL,
        package_key TEXT NOT NULL,
        PRIMARY KEY (workspace_id, package_key)
    )`,
];

function pickingQueries(workspaceId, packages) {
    return [
        {
            sql: 'SELECT id, operation_date, snapshot_json FROM picking_exports WHERE workspace_id = ? ORDER BY id DESC LIMIT 1',
            args: [workspaceId],
        },
        {
            sql: 'SELECT package_key FROM picking_exported_shipments WHERE workspace_id = ? AND package_key IN (SELECT value FROM json_each(?))',
            args: [workspaceId, JSON.stringify(packages.map((shipment) => shipment.key))],
        },
    ];
}

function readPicking(results, packages) {
    const last = results[0].rows[0];
    const exported = new Set(results[1].rows.map((row) => row.package_key));
    return {
        lastExport: last ? { id: Number(last.id), date: last.operation_date, ...JSON.parse(last.snapshot_json) } : null,
        pending: packages.filter((shipment) => !exported.has(shipment.key)),
    };
}

async function savePickingExport(db, workspaceId, packages) {
    const transaction = await db.transaction('write');
    try {
        const { lastExport, pending } = readPicking(await transaction.batch(pickingQueries(workspaceId, packages)), packages);
        if (!pending.length) return { lastExport, pending, created: false };

        const now = new Date();
        const date = getArgentinaDateString(now);
        const snapshot = {
            supplemental: lastExport?.date === date,
            generatedAt: formatArgentinaDateTime(now),
            packageCount: pending.length,
            items: groupPickingProducts(pending),
        };
        const inserted = await transaction.execute({
            sql: 'INSERT INTO picking_exports (workspace_id, operation_date, snapshot_json) VALUES (?, ?, ?)',
            args: [workspaceId, date, JSON.stringify(snapshot)],
        });
        await transaction.execute({
            sql: 'INSERT INTO picking_exported_shipments (workspace_id, package_key) SELECT ?, value FROM json_each(?)',
            args: [workspaceId, JSON.stringify(pending.map((shipment) => shipment.key))],
        });
        await transaction.commit();
        return { lastExport: { id: Number(inserted.lastInsertRowid), date, ...snapshot }, pending: [], created: true };
    } finally {
        transaction.close();
    }
}

export function createPickingExportRepository(db) {
    let schemaReady;
    function ensureSchema() {
        return schemaReady ||= db.batch(schema, 'write').catch((error) => {
            schemaReady = null;
            throw error;
        });
    }

    return {
        async read(workspaceId, packages) {
            await ensureSchema();
            return readPicking(await db.batch(pickingQueries(workspaceId, packages), 'read'), packages);
        },
        async save(workspaceId, packages) {
            await ensureSchema();
            return savePickingExport(db, workspaceId, packages);
        },
    };
}
