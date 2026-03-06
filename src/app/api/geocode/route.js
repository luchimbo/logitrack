import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { getDateRange } from '@/lib/dateUtils';

// Helper delay to avoid spamming Nominatim
const delay = ms => new Promise(res => setTimeout(res, ms));

export async function GET(request) {
    try {
        await ensureDb();
        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period');
        const specificDate = searchParams.get('date');

        // Find un-geocoded shipments matching current date filter
        let sql = `SELECT s.id, s.address, s.city, s.partido, s.province 
                   FROM shipments s
                   JOIN daily_batches b ON s.batch_id = b.id
                   WHERE s.lat IS NULL OR s.lng IS NULL`;
        let args = [];

        if (period) {
            const range = getDateRange(period, specificDate);
            sql += ` AND b.date >= ? AND b.date <= ?`;
            args.push(range.from, range.to);
        }

        sql += ` LIMIT 100`; // Limit to avoid massive payloads

        const result = await db.execute({ sql, args });
        return NextResponse.json({
            count: result.rows.length,
            shipments: result.rows
        });
    } catch (error) {
        console.error("Geocode GET Error:", error);
        return NextResponse.json({ error: "Failed to fetch missing coordinates" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        await ensureDb();
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const lat = searchParams.get('lat');
        const lng = searchParams.get('lng');

        if (!id || !lat || !lng) {
            return NextResponse.json({ error: "Missing required params" }, { status: 400 });
        }

        await db.execute({
            sql: "UPDATE shipments SET lat = ?, lng = ? WHERE id = ?",
            args: [parseFloat(lat), parseFloat(lng), id]
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Geocode POST Error:", error);
        return NextResponse.json({ error: "Failed to update coordinates" }, { status: 500 });
    }
}
