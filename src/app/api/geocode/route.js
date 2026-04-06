import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { getDateRange } from '@/lib/dateUtils';
import { requireWorkspaceActor } from '@/lib/auth';

const stadiaApiKey = process.env.STADIA_MAPS_API_KEY || process.env.NEXT_PUBLIC_STADIA_MAPS_API_KEY;

async function geocodeWithStadia(query) {
    if (!stadiaApiKey) {
        throw new Error('STADIA_MAPS_API_KEY no configurada');
    }

    const url = `https://api.stadiamaps.com/geocoding/v1/search?text=${encodeURIComponent(query)}&size=1&api_key=${encodeURIComponent(stadiaApiKey)}`;
    const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
    });

    if (!res.ok) {
        throw new Error(`Stadia geocoding error ${res.status}`);
    }

    const data = await res.json();
    const feature = data?.features?.[0];
    const coordinates = feature?.geometry?.coordinates;

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return null;
    }

    const [lng, lat] = coordinates;
    return { lat, lng, raw: feature };
}

export async function GET(request) {
    try {
        await ensureDb();
        const authResult = await requireWorkspaceActor(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }
        const workspaceId = authResult.actor.workspaceId;
        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period');
        const specificDate = searchParams.get('date');

        // Find un-geocoded shipments matching current date filter
        let sql = `SELECT s.id, s.address, s.city, s.partido, s.province 
                   FROM shipments s
                   JOIN daily_batches b ON s.batch_id = b.id
                   WHERE s.workspace_id = ? AND b.workspace_id = ? AND (s.lat IS NULL OR s.lng IS NULL)`;
        let args = [workspaceId, workspaceId];

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
        const authResult = await requireWorkspaceActor(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }
        const workspaceId = authResult.actor.workspaceId;
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const lat = searchParams.get('lat');
        const lng = searchParams.get('lng');

        if (id && lat && lng) {
            await db.execute({
                sql: "UPDATE shipments SET lat = ?, lng = ? WHERE id = ? AND workspace_id = ?",
                args: [parseFloat(lat), parseFloat(lng), id, workspaceId]
            });

            return NextResponse.json({ success: true });
        }

        const body = await request.json();
        const shipmentId = body?.id;
        const query = String(body?.query || '').trim();

        if (!shipmentId || !query) {
            return NextResponse.json({ error: "Missing required params" }, { status: 400 });
        }

        const geocoded = await geocodeWithStadia(query);

        if (!geocoded) {
            return NextResponse.json({ error: 'No se encontraron coordenadas' }, { status: 404 });
        }

        await db.execute({
            sql: "UPDATE shipments SET lat = ?, lng = ? WHERE id = ? AND workspace_id = ?",
            args: [parseFloat(geocoded.lat), parseFloat(geocoded.lng), shipmentId, workspaceId]
        });

        return NextResponse.json({ success: true, lat: geocoded.lat, lng: geocoded.lng });
    } catch (error) {
        console.error("Geocode POST Error:", error);
        return NextResponse.json({ error: "Failed to update coordinates" }, { status: 500 });
    }
}
