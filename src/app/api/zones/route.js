import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { normalizeName, getAllZones } from '@/lib/zoneMapper';

export async function GET() {
    try {
        const zones = await getAllZones();
        return NextResponse.json(zones);
    } catch (error) {
        console.error("Error fetching zones:", error);
        return NextResponse.json({ error: "Failed to fetch zones" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { searchParams } = new URL(request.url);
        const partido = searchParams.get('partido');
        const carrier_name = searchParams.get('carrier_name');

        if (!partido || !carrier_name) {
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
        }

        const normPartido = normalizeName(partido);

        // Upsert equivalent
        await db.execute({
            sql: `INSERT INTO zone_mappings (partido, carrier_name)
            VALUES (?, ?)
            ON CONFLICT(partido) DO UPDATE SET carrier_name = excluded.carrier_name`,
            args: [normPartido, carrier_name]
        });

        // We skip auto-reassigning for today's batch here to keep it simple,
        // we can implement a separate endpoint for forced reassignment.

        return NextResponse.json({ partido: normPartido, carrier_name });
    } catch (error) {
        console.error("Error creating/updating zone:", error);
        return NextResponse.json({ error: "Failed to save zone" }, { status: 500 });
    }
}
