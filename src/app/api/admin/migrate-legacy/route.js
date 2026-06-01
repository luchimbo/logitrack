import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireGlobalAdmin } from '@/lib/auth';

const OWNER_EMAIL = 'camilopcmidi@gmail.com';

// Tables where workspace_id rows should be reassigned
const WORKSPACE_TABLES = [
    'shipments',
    'daily_batches',
    'carriers',
    'zone_mappings',
    'print_jobs',
    'print_job_items',
    'workspace_printers',
    'mercadolibre_orders',
    'mercadolibre_notifications',
    'tiendanube_orders',
    'shopify_orders',
    'zipnova_shipments',
    'zipnova_collections',
    'correo_argentino_shipments',
    'geocode_cache',
    'print_queue',
    'audit_logs',
];

async function exec(sql, args = []) {
    return db.execute({ sql, args });
}

export async function POST(request) {
    try {
        await ensureDb();
        const authResult = await requireGlobalAdmin(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }

        const log = [];

        // 1. Find legacy workspace
        const legacyResult = await exec(
            "SELECT id FROM workspaces WHERE slug = ? LIMIT 1",
            ['legacy']
        );
        if (!legacyResult.rows.length) {
            return NextResponse.json({ error: 'Workspace legacy no encontrado' }, { status: 404 });
        }
        const legacyWorkspaceId = Number(legacyResult.rows[0].id);
        log.push(`Legacy workspace id: ${legacyWorkspaceId}`);

        // 2. Find camilopcmidi's app_user
        const userResult = await exec(
            "SELECT id FROM app_users WHERE lower(email) = lower(?) LIMIT 1",
            [OWNER_EMAIL]
        );
        if (!userResult.rows.length) {
            return NextResponse.json({ error: `Usuario ${OWNER_EMAIL} no encontrado` }, { status: 404 });
        }
        const appUserId = Number(userResult.rows[0].id);
        log.push(`App user id (${OWNER_EMAIL}): ${appUserId}`);

        // 3. Ensure they're owner of legacy workspace
        await exec(
            `INSERT INTO workspace_members (workspace_id, app_user_id, role)
             VALUES (?, ?, 'owner')
             ON CONFLICT(workspace_id, app_user_id) DO UPDATE SET role = 'owner'`,
            [legacyWorkspaceId, appUserId]
        );

        // 4. Get all their workspace memberships (ordered oldest first)
        const membershipsResult = await exec(
            `SELECT wm.id AS wm_id, wm.workspace_id, w.slug, w.name
             FROM workspace_members wm
             JOIN workspaces w ON w.id = wm.workspace_id
             WHERE wm.app_user_id = ?
             ORDER BY wm.id ASC`,
            [appUserId]
        );
        const memberships = membershipsResult.rows;
        log.push(`Memberships encontradas: ${memberships.map(m => `${m.name}(id=${m.workspace_id},wm_id=${m.wm_id})`).join(', ')}`);

        // 5. For each non-legacy workspace, migrate data to legacy then remove empty workspace
        let migratedWorkspaces = [];
        for (const m of memberships) {
            if (Number(m.workspace_id) === legacyWorkspaceId) continue;

            const srcId = Number(m.workspace_id);
            log.push(`Procesando workspace extra: ${m.name} (id=${srcId})`);

            // Check if this workspace has any real data
            const shipmentCount = await exec(
                "SELECT COUNT(*) AS cnt FROM shipments WHERE workspace_id = ?", [srcId]
            );
            const cnt = Number(shipmentCount.rows[0]?.cnt || 0);
            log.push(`  shipments en workspace ${srcId}: ${cnt}`);

            // Migrate all tables from srcId → legacyWorkspaceId
            for (const table of WORKSPACE_TABLES) {
                try {
                    const result = await exec(
                        `UPDATE ${table} SET workspace_id = ? WHERE workspace_id = ?`,
                        [legacyWorkspaceId, srcId]
                    );
                    if (result.rowsAffected > 0) {
                        log.push(`  ${table}: migradas ${result.rowsAffected} filas`);
                    }
                } catch (e) {
                    // Table might not have workspace_id column — skip
                    log.push(`  ${table}: skip (${e.message?.slice(0, 60)})`);
                }
            }

            // Migrate workspace_settings
            const settingsSrc = await exec(
                "SELECT * FROM workspace_settings WHERE workspace_id = ? LIMIT 1", [srcId]
            );
            if (settingsSrc.rows.length) {
                const s = settingsSrc.rows[0];
                await exec(
                    `INSERT OR IGNORE INTO workspace_settings (workspace_id, printing_setup_completed)
                     VALUES (?, ?)`,
                    [legacyWorkspaceId, s.printing_setup_completed]
                );
                // If legacy already has settings, update if src has completed setup
                if (Number(s.printing_setup_completed) === 1) {
                    await exec(
                        "UPDATE workspace_settings SET printing_setup_completed = 1 WHERE workspace_id = ?",
                        [legacyWorkspaceId]
                    );
                }
                log.push(`  workspace_settings: migradas`);
            }

            // Remove membership in extra workspace
            await exec(
                "DELETE FROM workspace_members WHERE workspace_id = ? AND app_user_id = ?",
                [srcId, appUserId]
            );
            log.push(`  Membership eliminada para ${OWNER_EMAIL} en workspace ${srcId}`);

            // Remove workspace if now empty (no other members)
            const othersResult = await exec(
                "SELECT COUNT(*) AS cnt FROM workspace_members WHERE workspace_id = ?", [srcId]
            );
            if (Number(othersResult.rows[0]?.cnt || 0) === 0) {
                await exec("DELETE FROM workspace_settings WHERE workspace_id = ?", [srcId]);
                await exec("DELETE FROM workspace_integrations WHERE workspace_id = ?", [srcId]);
                await exec("DELETE FROM workspace_integration_connections WHERE workspace_id = ?", [srcId]);
                await exec("DELETE FROM workspaces WHERE id = ?", [srcId]);
                log.push(`  Workspace ${srcId} eliminado (estaba vacío)`);
            }

            migratedWorkspaces.push(srcId);
        }

        // 6. Also backfill any NULL workspace_id rows to legacy
        for (const table of WORKSPACE_TABLES) {
            try {
                const result = await exec(
                    `UPDATE ${table} SET workspace_id = ? WHERE workspace_id IS NULL`,
                    [legacyWorkspaceId]
                );
                if (result.rowsAffected > 0) {
                    log.push(`${table}: backfill ${result.rowsAffected} filas NULL → legacy`);
                }
            } catch (_) {}
        }

        // 7. Ensure legacy workspace has settings
        await exec(
            `INSERT OR IGNORE INTO workspace_settings (workspace_id, printing_setup_completed)
             VALUES (?, 1)`,
            [legacyWorkspaceId]
        );

        // 8. Final state: show camilopcmidi's remaining memberships
        const finalMemberships = await exec(
            `SELECT wm.id AS wm_id, wm.workspace_id, wm.role, w.slug, w.name
             FROM workspace_members wm
             JOIN workspaces w ON w.id = wm.workspace_id
             WHERE wm.app_user_id = ?
             ORDER BY wm.id ASC`,
            [appUserId]
        );

        return NextResponse.json({
            success: true,
            legacyWorkspaceId,
            migratedFrom: migratedWorkspaces,
            finalMemberships: finalMemberships.rows,
            log,
        });
    } catch (error) {
        console.error('Migration error:', error);
        return NextResponse.json({ error: error.message || 'Error en migración' }, { status: 500 });
    }
}
