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

        // Check if this exact combo already exists
        const existing = await db.execute({
            sql: "SELECT id FROM zone_mappings WHERE partido = ? AND carrier_name = ?",
            args: [normPartido, carrier_name]
        });

        if (existing.rows.length > 0) {
            return NextResponse.json({ message: "Already assigned", partido: normPartido, carrier_name });
        }

        // Insert new mapping (allow multiple carriers per partido)
        await db.execute({
            sql: "INSERT INTO zone_mappings (partido, carrier_name) VALUES (?, ?)",
            args: [normPartido, carrier_name]
        });

        return NextResponse.json({ partido: normPartido, carrier_name });
    } catch (error) {
        console.error("Error creating zone:", error);
        return NextResponse.json({ error: "Failed to save zone" }, { status: 500 });
    }
}
