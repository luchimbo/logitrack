import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { getDateRange } from '@/lib/dateUtils';
import { requireWorkspaceActor } from '@/lib/auth';

const stadiaApiKey = process.env.STADIA_MAPS_API_KEY || process.env.NEXT_PUBLIC_STADIA_MAPS_API_KEY;
const GEOCODE_CONCURRENCY = 5;
const ARGENTINA_BOUNDS = {
    minLat: -55.2,
    maxLat: -21.5,
    minLng: -73.7,
    maxLng: -53.5,
};

function isWithinArgentina(lat, lng) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
    return latitude >= ARGENTINA_BOUNDS.minLat && latitude <= ARGENTINA_BOUNDS.maxLat && longitude >= ARGENTINA_BOUNDS.minLng && longitude <= ARGENTINA_BOUNDS.maxLng;
}

function buildShipmentQuery(shipment) {
    const qArr = [];
    if (shipment?.address) qArr.push(String(shipment.address).trim());
    if (shipment?.city) qArr.push(String(shipment.city).trim());
    if (shipment?.partido) qArr.push(String(shipment.partido).trim());
    if (shipment?.province && !String(shipment.province).includes('CABA')) qArr.push(String(shipment.province).trim());
    qArr.push('Argentina');
    return qArr.join(', ');
}

async function geocodeShipment(workspaceId, shipment) {
    const query = buildShipmentQuery(shipment);
    if (!query.trim()) {
        return { success: false, id: shipment.id, reason: 'empty_query' };
    }

    const geocoded = await geocodeWithStadia(query);
    if (!geocoded) {
        return { success: false, id: shipment.id, reason: 'not_found' };
    }

    await db.execute({
        sql: "UPDATE shipments SET lat = ?, lng = ? WHERE id = ? AND workspace_id = ?",
        args: [parseFloat(geocoded.lat), parseFloat(geocoded.lng), shipment.id, workspaceId]
    });

    return { success: true, id: shipment.id, lat: geocoded.lat, lng: geocoded.lng };
}

async function geocodeShipmentsInBatches(workspaceId, shipments) {
    const results = [];
    for (let i = 0; i < shipments.length; i += GEOCODE_CONCURRENCY) {
        const chunk = shipments.slice(i, i + GEOCODE_CONCURRENCY);
        const settled = await Promise.allSettled(chunk.map((shipment) => geocodeShipment(workspaceId, shipment)));
        for (const item of settled) {
            if (item.status === 'fulfilled') {
                results.push(item.value);
            } else {
                results.push({ success: false, reason: item.reason?.message || 'unknown_error' });
            }
        }
    }
    return results;
}

async function geocodeWithStadia(query) {
    if (!stadiaApiKey) {
        throw new Error('STADIA_MAPS_API_KEY no configurada');
    }

    const url = `https://api.stadiamaps.com/geocoding/v1/search?text=${encodeURIComponent(query)}&size=5&boundary.country=ARG&api_key=${encodeURIComponent(stadiaApiKey)}`;
    const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
    });

    if (!res.ok) {
        throw new Error(`Stadia geocoding error ${res.status}`);
    }

    const data = await res.json();
    const features = Array.isArray(data?.features) ? data.features : [];

    for (const feature of features) {
        const coordinates = feature?.geometry?.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
        const [lng, lat] = coordinates;
        const countryCode = String(feature?.properties?.country_code || feature?.properties?.country_a || '').toUpperCase();
        if ((countryCode === 'AR' || countryCode === 'ARG') && isWithinArgentina(lat, lng)) {
            return { lat, lng, raw: feature };
        }
    }

    return null;
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
        let sql = `SELECT s.id, s.address, s.city, s.partido, s.province, s.lat, s.lng 
                   FROM shipments s
                   JOIN daily_batches b ON s.batch_id = b.id
                    WHERE s.workspace_id = ? AND b.workspace_id = ? AND (
                        s.lat IS NULL OR s.lng IS NULL OR
                        s.lat < ? OR s.lat > ? OR s.lng < ? OR s.lng > ?
                    )`;
        let args = [workspaceId, workspaceId];
        args.push(ARGENTINA_BOUNDS.minLat, ARGENTINA_BOUNDS.maxLat, ARGENTINA_BOUNDS.minLng, ARGENTINA_BOUNDS.maxLng);

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
        const shipments = Array.isArray(body?.shipments) ? body.shipments : null;

        if (shipments && shipments.length > 0) {
            const results = await geocodeShipmentsInBatches(workspaceId, shipments);
            const successCount = results.filter((item) => item.success).length;
            return NextResponse.json({
                success: true,
                processed: shipments.length,
                geocoded: successCount,
                failed: shipments.length - successCount,
            });
        }

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
