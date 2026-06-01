import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireGlobalAdmin } from '@/lib/auth';

async function exec(sql, args = []) {
    return db.execute({ sql, args });
}

// Reasigna carriers y zone_mappings al workspace activo de camilopcmidi.
// No borra nada. Es seguro correrlo múltiples veces.
export async function POST(request) {
    try {
        await ensureDb();
        const authResult = await requireGlobalAdmin(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }

        const workspaceId = authResult.actor.workspaceId;
        const log = [`Workspace activo de camilopcmidi: ${workspaceId}`];

        // Mueve TODO al workspace activo (cualquier workspace_id distinto o NULL)
        const tables = [
            'carriers',
            'zone_mappings',
            'shipments',
            'daily_batches',
            'print_jobs',
            'print_job_items',
            'mercadolibre_orders',
            'tiendanube_orders',
            'shopify_orders',
            'zipnova_shipments',
            'zipnova_collections',
            'correo_argentino_shipments',
            'geocode_cache',
            'print_queue',
            'audit_logs',
        ];

        for (const table of tables) {
            try {
                // Rows de otros workspaces → workspace activo
                const r1 = await exec(
                    `UPDATE ${table} SET workspace_id = ? WHERE workspace_id != ? OR workspace_id IS NULL`,
                    [workspaceId, workspaceId]
                );
                if (r1.rowsAffected > 0) {
                    log.push(`${table}: reasignadas ${r1.rowsAffected} filas al workspace ${workspaceId}`);
                }
            } catch (e) {
                log.push(`${table}: skip (${e.message?.slice(0, 80)})`);
            }
        }

        // Asegurar workspace_settings
        await exec(
            `INSERT OR IGNORE INTO workspace_settings (workspace_id, printing_setup_completed) VALUES (?, 1)`,
            [workspaceId]
        );

        // Asegurar workspace_printers también
        try {
            const r = await exec(
                `UPDATE workspace_printers SET workspace_id = ? WHERE workspace_id != ? OR workspace_id IS NULL`,
                [workspaceId, workspaceId]
            );
            if (r.rowsAffected > 0) log.push(`workspace_printers: reasignadas ${r.rowsAffected}`);
        } catch (e) {
            log.push(`workspace_printers: skip (${e.message?.slice(0, 80)})`);
        }

        // Estado final
        const carriersNow = await exec(
            'SELECT name, display_name, color FROM carriers WHERE workspace_id = ? ORDER BY name',
            [workspaceId]
        );
        const zonesNow = await exec(
            'SELECT COUNT(*) AS cnt FROM zone_mappings WHERE workspace_id = ?',
            [workspaceId]
        );
        const shipmentsNow = await exec(
            `SELECT COUNT(*) AS total,
                SUM(CASE WHEN assigned_carrier IS NOT NULL AND assigned_carrier != '' THEN 1 ELSE 0 END) AS assigned
             FROM shipments WHERE workspace_id = ?`,
            [workspaceId]
        );

        return NextResponse.json({
            success: true,
            workspaceId,
            log,
            result: {
                carriers: carriersNow.rows,
                zone_mappings_count: Number(zonesNow.rows[0]?.cnt || 0),
                shipments_total: Number(shipmentsNow.rows[0]?.total || 0),
                shipments_assigned: Number(shipmentsNow.rows[0]?.assigned || 0),
            },
        });
    } catch (error) {
        console.error('Reparar error:', error);
        return NextResponse.json({ error: error.message || 'Error' }, { status: 500 });
    }
}
