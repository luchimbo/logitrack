import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireGlobalAdmin } from '@/lib/auth';

async function exec(sql, args = []) {
    return db.execute({ sql, args });
}

export async function GET(request) {
    try {
        await ensureDb();
        const authResult = await requireGlobalAdmin(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }

        const actorWorkspaceId = authResult.actor.workspaceId;

        // All workspaces
        const workspaces = await exec(`
            SELECT w.id, w.name, w.slug, w.created_at,
                COUNT(DISTINCT wm.app_user_id) AS members,
                COUNT(DISTINCT s.id) AS shipments,
                COUNT(DISTINCT c.id) AS carriers,
                COUNT(DISTINCT zm.id) AS zone_mappings,
                COUNT(DISTINCT wi.id) AS integrations,
                COUNT(DISTINCT wic.id) AS connections
            FROM workspaces w
            LEFT JOIN workspace_members wm ON wm.workspace_id = w.id
            LEFT JOIN shipments s ON s.workspace_id = w.id
            LEFT JOIN carriers c ON c.workspace_id = w.id
            LEFT JOIN zone_mappings zm ON zm.workspace_id = w.id
            LEFT JOIN workspace_integrations wi ON wi.workspace_id = w.id
            LEFT JOIN workspace_integration_connections wic ON wic.workspace_id = w.id
            GROUP BY w.id ORDER BY w.id ASC
        `);

        // camilopcmidi memberships
        const camiloUser = await exec(
            "SELECT id, email FROM app_users WHERE lower(email) = lower('camilopcmidi@gmail.com') LIMIT 1"
        );
        let camiloMemberships = { rows: [] };
        if (camiloUser.rows.length) {
            camiloMemberships = await exec(`
                SELECT wm.id AS wm_id, wm.workspace_id, wm.role, w.name, w.slug
                FROM workspace_members wm
                JOIN workspaces w ON w.id = wm.workspace_id
                WHERE wm.app_user_id = ?
                ORDER BY wm.id ASC
            `, [Number(camiloUser.rows[0].id)]);
        }

        // Carriers per workspace
        const carriers = await exec(`
            SELECT workspace_id, name, display_name, color FROM carriers ORDER BY workspace_id, name
        `);

        // Zone mappings per workspace
        const zones = await exec(`
            SELECT workspace_id, COUNT(*) AS cnt FROM zone_mappings GROUP BY workspace_id
        `);

        // Shipments with assigned_carrier status
        const shipmentStats = await exec(`
            SELECT workspace_id,
                COUNT(*) AS total,
                SUM(CASE WHEN assigned_carrier IS NOT NULL AND assigned_carrier != '' THEN 1 ELSE 0 END) AS assigned,
                SUM(CASE WHEN assigned_carrier IS NULL OR assigned_carrier = '' THEN 1 ELSE 0 END) AS unassigned
            FROM shipments GROUP BY workspace_id
        `);

        // Integration connections (no config, just metadata)
        const integrationConnections = await exec(`
            SELECT id, workspace_id, provider, external_store_id, display_name, is_active, connected_at
            FROM workspace_integration_connections
            ORDER BY workspace_id, provider
        `);

        const integrationsMeta = await exec(`
            SELECT workspace_id, provider, is_active, connected_at
            FROM workspace_integrations
            ORDER BY workspace_id, provider
        `);

        return NextResponse.json({
            actorWorkspaceId,
            workspaces: workspaces.rows,
            camiloUser: camiloUser.rows[0] || null,
            camiloMemberships: camiloMemberships.rows,
            carriers: carriers.rows,
            zones: zones.rows,
            shipmentStats: shipmentStats.rows,
            integrationConnections: integrationConnections.rows,
            integrationsMeta: integrationsMeta.rows,
        });
    } catch (error) {
        console.error('Diagnostico error:', error);
        return NextResponse.json({ error: error.message || 'Error' }, { status: 500 });
    }
}
