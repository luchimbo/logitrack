import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { normalizeName, getAllZones } from '@/lib/zoneMapper';
import { requireWorkspaceActor, requireWorkspaceAdmin } from '@/lib/auth';
import { carrierConfigScope } from '@/lib/globalCarrierConfig';

export async function GET(request) {
    try {
        const authResult = await requireWorkspaceActor(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }
        const zones = await getAllZones(authResult.actor.workspaceId);
        return NextResponse.json(zones);
    } catch (error) {
        console.error("Error fetching zones:", error);
        return NextResponse.json({ error: "Failed to fetch zones" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const authResult = await requireWorkspaceAdmin(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }
        const scope = await carrierConfigScope(authResult.actor.workspaceId);
        const { searchParams } = new URL(request.url);
        const partido = searchParams.get('partido');
        const carrier_name = searchParams.get('carrier_name');

        if (!partido || !carrier_name) {
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
        }

        const carrier = await db.execute({ sql: 'SELECT id FROM carriers WHERE workspace_id = ? AND name = ? LIMIT 1', args: [scope, carrier_name] });
        if (!carrier.rows.length) return NextResponse.json({ error: 'Transportista no encontrado' }, { status: 404 });
        const normPartido = normalizeName(partido);

        // Check if this exact combo already exists
        const existing = await db.execute({
            sql: "SELECT id FROM zone_mappings WHERE workspace_id = ? AND partido = ? AND carrier_name = ?",
            args: [scope, normPartido, carrier_name]
        });

        if (existing.rows.length > 0) {
            return NextResponse.json({ message: "Already assigned", partido: normPartido, carrier_name });
        }

        // Insert new mapping (allow multiple carriers per partido)
        await db.execute({
            sql: "INSERT INTO zone_mappings (workspace_id, partido, carrier_name) VALUES (?, ?, ?)",
            args: [scope, normPartido, carrier_name]
        });

        const inserted = await db.execute({
            sql: "SELECT id FROM zone_mappings WHERE workspace_id = ? AND partido = ? AND carrier_name = ? ORDER BY id DESC LIMIT 1",
            args: [scope, normPartido, carrier_name]
        });
        return NextResponse.json({ id: inserted.rows[0]?.id, partido: normPartido, carrier_name });
    } catch (error) {
        console.error("Error creating zone:", error);
        return NextResponse.json({ error: "Failed to save zone" }, { status: 500 });
    }
}
