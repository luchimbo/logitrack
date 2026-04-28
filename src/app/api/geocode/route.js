import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { getDateRange } from '@/lib/dateUtils';
import { requireWorkspaceActor } from '@/lib/auth';

const GEOCODE_CONCURRENCY = 1;
const GEOCODE_DELAY_MS = 1100;
const REVERSE_VALIDATE_LIMIT = 15;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const ARGENTINA_BOUNDS = {
    minLat: -55.2,
    maxLat: -21.5,
    minLng: -73.7,
    maxLng: -53.5,
};

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildAddressKey(shipment) {
    return [
        shipment?.address,
        shipment?.city,
        shipment?.partido,
        shipment?.province,
        shipment?.postal_code,
        'Argentina',
    ].map(normalizeText).filter(Boolean).join('|');
}

function candidateParts(feature) {
    const address = feature?.address || {};
    return [
        feature?.display_name,
        address.city,
        address.town,
        address.village,
        address.municipality,
        address.county,
        address.state_district,
        address.state,
        address.suburb,
        address.city_district,
    ].filter(Boolean).map(normalizeText);
}

function googleComponent(components, type) {
    return components.find((component) => component.types?.includes(type))?.long_name || '';
}

function normalizeGoogleResult(result) {
    const components = Array.isArray(result?.address_components) ? result.address_components : [];
    const country = googleComponent(components, 'country');
    return {
        display_name: result?.formatted_address || '',
        address: {
            country_code: country === 'Argentina' ? 'AR' : country,
            city: googleComponent(components, 'locality') || googleComponent(components, 'administrative_area_level_2'),
            town: googleComponent(components, 'sublocality') || googleComponent(components, 'administrative_area_level_3'),
            village: '',
            municipality: googleComponent(components, 'administrative_area_level_2'),
            county: googleComponent(components, 'administrative_area_level_2'),
            state_district: googleComponent(components, 'administrative_area_level_2'),
            state: googleComponent(components, 'administrative_area_level_1'),
            suburb: googleComponent(components, 'sublocality') || googleComponent(components, 'neighborhood'),
            city_district: googleComponent(components, 'administrative_area_level_3'),
            postcode: googleComponent(components, 'postal_code'),
        },
    };
}

function scoreCandidate(feature, shipment) {
    const address = feature?.address || {};
    const parts = candidateParts(feature);
    const city = normalizeText(shipment?.city);
    const partido = normalizeText(shipment?.partido);
    const province = normalizeText(shipment?.province);
    const postalCode = normalizeText(shipment?.postal_code);

    let score = 0;
    if (String(address.country_code || '').toUpperCase() !== 'AR') return -1;

    const matches = (value) => value && parts.some((part) => part.includes(value) || value.includes(part));

    if (province && matches(province)) score += 4;
    if (partido && matches(partido)) score += 3;
    if (city && matches(city)) score += 3;
    if (postalCode && normalizeText(address.postcode) === postalCode) score += 2;

    if (!province && !partido && !city) {
        score += 1;
    }

    return score;
}

async function reverseGeocodeWithNominatim(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=10&addressdetails=1`;
    const res = await fetch(url, {
        headers: {
            Accept: 'application/json',
            'User-Agent': 'LogiTrack/1.0 (reverse-geocoding)',
            'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
        },
        cache: 'no-store',
    });

    if (!res.ok) {
        throw new Error(`Nominatim reverse geocoding error ${res.status}`);
    }

    return res.json();
}

async function reverseGeocodeWithGoogle(lat, lng) {
    const params = new URLSearchParams({
        latlng: `${lat},${lng}`,
        language: 'es-AR',
        region: 'ar',
        key: GOOGLE_MAPS_API_KEY,
    });
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`, {
        cache: 'no-store',
    });

    if (!res.ok) {
        throw new Error(`Google reverse geocoding error ${res.status}`);
    }

    const data = await res.json();
    if (data.status !== 'OK' || !Array.isArray(data.results) || !data.results.length) {
        throw new Error(`Google reverse geocoding status ${data.status || 'UNKNOWN'}`);
    }

    return normalizeGoogleResult(data.results[0]);
}

async function detectSuspiciousShipments(rows) {
    const suspicious = [];
    for (const shipment of rows.slice(0, REVERSE_VALIDATE_LIMIT)) {
        try {
            const reverse = GOOGLE_MAPS_API_KEY
                ? await reverseGeocodeWithGoogle(shipment.lat, shipment.lng)
                : await reverseGeocodeWithNominatim(shipment.lat, shipment.lng);
            const score = scoreCandidate(reverse, shipment);
            if (score < 3) {
                suspicious.push(shipment);
            }
            await delay(350);
        } catch (error) {
            console.error('Reverse geocode validation error:', error?.message || error);
        }
    }
    return suspicious;
}

function isWithinArgentina(lat, lng) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
    return latitude >= ARGENTINA_BOUNDS.minLat && latitude <= ARGENTINA_BOUNDS.maxLat && longitude >= ARGENTINA_BOUNDS.minLng && longitude <= ARGENTINA_BOUNDS.maxLng;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildShipmentQuery(shipment) {
    const qArr = [];
    if (shipment?.address) qArr.push(String(shipment.address).trim());
    if (shipment?.city) qArr.push(String(shipment.city).trim());
    if (shipment?.partido) qArr.push(String(shipment.partido).trim());
    if (shipment?.province && !String(shipment.province).includes('CABA')) qArr.push(String(shipment.province).trim());
    if (shipment?.postal_code) qArr.push(String(shipment.postal_code).trim());
    qArr.push('Argentina');
    return qArr.join(', ');
}

function buildStructuredParams(shipment) {
    const params = new URLSearchParams({
        format: 'jsonv2',
        limit: '5',
        countrycodes: 'ar',
        addressdetails: '1',
    });

    if (shipment?.address) params.set('street', String(shipment.address).trim());
    if (shipment?.city) params.set('city', String(shipment.city).trim());
    if (shipment?.partido) params.set('county', String(shipment.partido).trim());
    if (shipment?.province) params.set('state', String(shipment.province).trim());
    if (shipment?.postal_code) params.set('postalcode', String(shipment.postal_code).trim());
    return params;
}

async function geocodeShipment(workspaceId, shipment) {
    const query = buildShipmentQuery(shipment);
    if (!query.trim()) {
        return { success: false, id: shipment.id, reason: 'empty_query' };
    }

    const addressKey = buildAddressKey(shipment);
    const cached = addressKey ? await getCachedGeocode(workspaceId, addressKey) : null;
    if (cached) {
        await updateShipmentCoordinates(workspaceId, shipment.id, cached.lat, cached.lng);
        return { success: true, id: shipment.id, lat: cached.lat, lng: cached.lng, cached: true };
    }

    let geocoded = null;

    if (GOOGLE_MAPS_API_KEY) {
        try {
            geocoded = await geocodeWithGoogle(shipment, query);
        } catch (error) {
            console.error('Google geocoding fallback error:', error?.message || error);
        }
    }

    if (!geocoded) {
        geocoded = await geocodeWithNominatim(shipment, query);
    }

    if (!geocoded) {
        return { success: false, id: shipment.id, reason: 'not_found' };
    }

    await updateShipmentCoordinates(workspaceId, shipment.id, geocoded.lat, geocoded.lng);
    if (addressKey) {
        await saveCachedGeocode(workspaceId, addressKey, geocoded);
    }

    await delay(GEOCODE_DELAY_MS);

    return { success: true, id: shipment.id, lat: geocoded.lat, lng: geocoded.lng };
}

async function updateShipmentCoordinates(workspaceId, shipmentId, lat, lng) {
    await db.execute({
        sql: "UPDATE shipments SET lat = ?, lng = ? WHERE id = ? AND workspace_id = ?",
        args: [parseFloat(lat), parseFloat(lng), shipmentId, workspaceId]
    });
}

async function getCachedGeocode(workspaceId, addressKey) {
    const result = await db.execute({
        sql: "SELECT lat, lng FROM geocode_cache WHERE workspace_id = ? AND address_key = ? LIMIT 1",
        args: [workspaceId, addressKey],
    });

    const row = result.rows[0];
    if (!row || !isWithinArgentina(row.lat, row.lng)) return null;

    await db.execute({
        sql: "UPDATE geocode_cache SET last_used_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND address_key = ?",
        args: [workspaceId, addressKey],
    });

    return { lat: Number(row.lat), lng: Number(row.lng) };
}

async function saveCachedGeocode(workspaceId, addressKey, geocoded) {
    await db.execute({
        sql: `INSERT INTO geocode_cache (workspace_id, address_key, lat, lng, provider, place_id, formatted_address, score, last_used_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(workspace_id, address_key) DO UPDATE SET
                lat = excluded.lat,
                lng = excluded.lng,
                provider = excluded.provider,
                place_id = excluded.place_id,
                formatted_address = excluded.formatted_address,
                score = excluded.score,
                last_used_at = CURRENT_TIMESTAMP`,
        args: [
            workspaceId,
            addressKey,
            parseFloat(geocoded.lat),
            parseFloat(geocoded.lng),
            geocoded.provider || null,
            geocoded.placeId || null,
            geocoded.formattedAddress || geocoded.raw?.display_name || null,
            Number.isFinite(geocoded.score) ? geocoded.score : null,
        ],
    });
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

async function fetchNominatim(url) {
    const res = await fetch(url, {
        headers: {
            Accept: 'application/json',
            'User-Agent': 'LogiTrack/1.0 (geocoding)',
            'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
        },
        cache: 'no-store',
    });

    if (!res.ok) {
        throw new Error(`Nominatim geocoding error ${res.status}`);
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
}

async function fetchGoogleGeocode(query) {
    const params = new URLSearchParams({
        address: query,
        language: 'es-AR',
        region: 'ar',
        components: 'country:AR',
        key: GOOGLE_MAPS_API_KEY,
    });

    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`, {
        cache: 'no-store',
    });

    if (!res.ok) {
        throw new Error(`Google geocoding error ${res.status}`);
    }

    const data = await res.json();
    if (data.status === 'ZERO_RESULTS') return [];
    if (data.status !== 'OK') {
        throw new Error(`Google geocoding status ${data.status || 'UNKNOWN'}`);
    }

    return Array.isArray(data.results) ? data.results : [];
}

async function geocodeWithGoogle(shipment, query) {
    const features = await fetchGoogleGeocode(buildShipmentQuery(shipment) || query);

    let best = null;
    let bestScore = -1;

    for (const feature of features) {
        const lat = Number(feature?.geometry?.location?.lat);
        const lng = Number(feature?.geometry?.location?.lng);
        if (!isWithinArgentina(lat, lng)) continue;

        const normalized = normalizeGoogleResult(feature);
        const score = scoreCandidate(normalized, shipment);
        if (score > bestScore) {
            bestScore = score;
            best = { lat, lng, raw: normalized, provider: 'google', placeId: feature?.place_id || null, formattedAddress: feature?.formatted_address || '', score };
        }
    }

    return bestScore >= 3 ? best : null;
}

async function geocodeWithNominatim(shipment, query) {
    const structuredParams = buildStructuredParams(shipment);
    let features = await fetchNominatim(`https://nominatim.openstreetmap.org/search?${structuredParams.toString()}`);

    if (!features.length) {
        features = await fetchNominatim(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ar&addressdetails=1&q=${encodeURIComponent(query)}`);
    }

    let best = null;
    let bestScore = -1;

    for (const feature of features) {
        const lat = Number(feature?.lat);
        const lng = Number(feature?.lon);
        if (!isWithinArgentina(lat, lng)) continue;

        const score = scoreCandidate(feature, shipment);
        if (score > bestScore) {
            bestScore = score;
            best = { lat, lng, raw: feature, provider: 'nominatim', formattedAddress: feature?.display_name || '', score };
        }
    }

    return bestScore >= 3 ? best : null;
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
        let sqlBase = `FROM shipments s
                   JOIN daily_batches b ON s.batch_id = b.id
                    WHERE s.workspace_id = ? AND b.workspace_id = ?`;
        let argsBase = [workspaceId, workspaceId];

        if (period) {
            const range = getDateRange(period, specificDate);
            sqlBase += ` AND b.date >= ? AND b.date <= ?`;
            argsBase.push(range.from, range.to);
        }

        const invalidSql = `SELECT s.id, s.address, s.city, s.partido, s.province, s.postal_code, s.lat, s.lng ${sqlBase}
            AND (
                s.lat IS NULL OR s.lng IS NULL OR
                s.lat < ? OR s.lat > ? OR s.lng < ? OR s.lng > ?
            )
            LIMIT 100`;
        const invalidArgs = [...argsBase, ARGENTINA_BOUNDS.minLat, ARGENTINA_BOUNDS.maxLat, ARGENTINA_BOUNDS.minLng, ARGENTINA_BOUNDS.maxLng];

        const result = await db.execute({ sql: invalidSql, args: invalidArgs });
        let shipments = [...result.rows];

        if (shipments.length < 100) {
            const validSql = `SELECT s.id, s.address, s.city, s.partido, s.province, s.postal_code, s.lat, s.lng ${sqlBase}
                AND s.lat IS NOT NULL AND s.lng IS NOT NULL
                AND s.lat >= ? AND s.lat <= ? AND s.lng >= ? AND s.lng <= ?
                LIMIT ?`;
            const validArgs = [...argsBase, ARGENTINA_BOUNDS.minLat, ARGENTINA_BOUNDS.maxLat, ARGENTINA_BOUNDS.minLng, ARGENTINA_BOUNDS.maxLng, REVERSE_VALIDATE_LIMIT];
            const validResult = await db.execute({ sql: validSql, args: validArgs });
            const suspicious = await detectSuspiciousShipments(validResult.rows);
            const seen = new Set(shipments.map((s) => s.id));
            for (const row of suspicious) {
                if (!seen.has(row.id)) {
                    shipments.push(row);
                    seen.add(row.id);
                }
            }
        }
        return NextResponse.json({
            count: shipments.length,
            shipments
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

        const shipmentQuery = {
            address: query,
            city: null,
            partido: null,
            province: null,
            postal_code: null,
        };

        let geocoded = null;
        if (GOOGLE_MAPS_API_KEY) {
            try {
                geocoded = await geocodeWithGoogle(shipmentQuery, query);
            } catch (error) {
                console.error('Google single geocoding fallback error:', error?.message || error);
            }
        }

        if (!geocoded) {
            geocoded = await geocodeWithNominatim(shipmentQuery, query);
        }

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
