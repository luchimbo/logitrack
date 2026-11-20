import boundaries from './flexPartidoBoundaries.json' with { type: 'json' };
import { resolvePartidoFromGeo } from './zplParser.js';

const partidoBoundaries = Object.entries(boundaries).filter(([, polygons]) => Array.isArray(polygons));
const knownPartidos = new Set([
    ...partidoBoundaries.map(([partido]) => partido),
    'la_matanza_norte', 'la_matanza_sur', 'villa_rosa', 'ingeniero_maschwitz', 'dique_lujan',
]);
const operationalParent = {
    la_matanza_norte: 'la_matanza', la_matanza_sur: 'la_matanza',
    villa_rosa: 'escobar', ingeniero_maschwitz: 'escobar', dique_lujan: 'escobar',
};
const parentOf = (partido) => operationalParent[partido] || partido;
const normalize = (value) => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const ambiguousLocalities = new Set(['canning', 'villa adelina', 'san francisco solano', 'libertad']);

function knownPartido(value) {
    if (normalize(value) === 'ciudad autonoma de buenos aires') return 'capital_federal';
    const id = resolvePartidoFromGeo(value);
    return knownPartidos.has(id) ? id : null;
}

export async function sharedFlexCarrier(shipment, mlAddress, carrierForPartido) {
    const city = knownPartido(shipment.city);
    const zone = knownPartido(shipment.province);
    if (!city || !zone || parentOf(city) === parentOf(zone)) return null;
    const municipality = knownPartido(mlAddress?.municipality?.name);
    const partidos = new Set([city, zone, municipality].filter(Boolean));
    const carriers = await Promise.all([...partidos].map(carrierForPartido));
    return carriers[0] && carriers.every(carrier => carrier === carriers[0]) ? carriers[0] : null;
}

export function hasFlexPartidoConflict(shipment, mlAddress) {
    const city = knownPartido(shipment.city) || knownPartido(shipment.partido);
    const zone = knownPartido(shipment.province);
    const municipality = knownPartido(mlAddress?.municipality?.name);
    const ambiguousCity = ambiguousLocalities.has(normalize(shipment.city));
    const ambiguousZone = ambiguousLocalities.has(normalize(shipment.province));
    return Boolean(
        (city && zone && parentOf(city) !== parentOf(zone)) ||
        (ambiguousCity && (!zone || ambiguousZone)) ||
        (ambiguousZone && (!city || ambiguousCity)) ||
        (municipality && shipment.partido && parentOf(municipality) !== parentOf(shipment.partido))
    );
}

function ringDistance([longitude, latitude], ring, metersPerLongitude) {
    let inside = false;
    let distanceSquared = Infinity;
    for (let i = 1; i < ring.length; i++) {
        const [x1, y1] = ring[i - 1];
        const [x2, y2] = ring[i];
        if ((y1 > latitude) !== (y2 > latitude) && longitude < x1 + (x2 - x1) * (latitude - y1) / (y2 - y1)) {
            inside = !inside;
        }
        const x = (x1 - longitude) * metersPerLongitude;
        const y = (y1 - latitude) * 111000;
        const dx = (x2 - x1) * metersPerLongitude;
        const dy = (y2 - y1) * 111000;
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared ? Math.max(0, Math.min(1, -(x * dx + y * dy) / lengthSquared)) : 0;
        distanceSquared = Math.min(distanceSquared, (x + t * dx) ** 2 + (y + t * dy) ** 2);
    }
    return { inside, distanceSquared };
}

function partidoAt(latitude, longitude, boundaryBufferMeters) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const point = [longitude, latitude];
    const metersPerLongitude = 111000 * Math.cos(latitude * Math.PI / 180);
    let match = null;
    for (const [partido, polygons] of partidoBoundaries) {
        for (const polygon of polygons) {
            const [outer, ...holes] = polygon.map(ring => ringDistance(point, ring, metersPerLongitude));
            if (!outer.inside || holes.some(hole => hole.inside)) continue;
            if (match && match !== partido) return null;
            if (Math.min(outer.distanceSquared, ...holes.map(hole => hole.distanceSquared)) < boundaryBufferMeters ** 2) return null;
            match = partido;
        }
    }
    return match;
}

function streetAndNumber(shipment, mlAddress) {
    const street = mlAddress?.street_name?.trim();
    const number = String(mlAddress?.street_number ?? '').trim();
    if (street && /^[1-9]\d{0,5}$/.test(number)) return { street, number: Number(number) };
    const found = String(shipment.address || '').split(',')[0].trim().match(/^(.+?)\s+([1-9]\d{0,5})$/);
    return found ? { street: found[1], number: Number(found[2]) } : null;
}

async function searchGeoref(shipment, mlAddress, fetchImpl) {
    const address = streetAndNumber(shipment, mlAddress);
    const locality = mlAddress?.city?.name || shipment.city || shipment.province;
    if (!address || !locality) return null;
    const localityName = normalize(locality);
    const caba = knownPartido(mlAddress?.state?.name || shipment.province) === 'capital_federal';
    const province = caba ? 'Ciudad Autónoma de Buenos Aires' : 'Buenos Aires';
    const url = new URL('https://apis.datos.gob.ar/georef/api/v2.0/direcciones');
    url.search = new URLSearchParams({ direccion: `${address.street} ${address.number}`, provincia: province, localidad: locality, max: '20' });

    try {
        const response = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
        if (!response.ok) return null;
        const { direcciones } = await response.json();
        const candidates = new Set();
        const streetTokens = normalize(address.street).replace(/^calle /, '').split(' ');
        for (const result of direcciones || []) {
            const matchedLocalities = [result.localidad?.nombre, result.localidad_censal?.nombre].map(normalize);
            const matchedStreet = normalize(result.calle?.nombre).split(' ');
            if (result.altura?.valor !== address.number || !matchedLocalities.includes(localityName) ||
                !streetTokens.every(token => matchedStreet.includes(token))) continue;
            const reported = caba ? 'capital_federal' : knownPartido(result.departamento?.nombre);
            const located = partidoAt(result.ubicacion?.lat, result.ubicacion?.lon, 150);
            if (reported && reported === located) candidates.add(located);
            else if (reported) candidates.add(null);
        }
        return candidates.size === 1 ? [...candidates][0] : null;
    } catch {
        return null;
    }
}

export async function verifyFlexPartido(shipment, mlAddress, fetchImpl = fetch) {
    const mlPartido = mlAddress?.geolocation_type === 'ROOFTOP'
        ? partidoAt(mlAddress.latitude, mlAddress.longitude, 60)
        : null;
    const partido = mlPartido || await searchGeoref(shipment, mlAddress, fetchImpl);
    if (!partido) return null;
    const labelPartido = shipment.partido;
    if (parentOf(labelPartido) === partido || (labelPartido === 'villa_rosa' && partido === 'pilar')) return labelPartido;
    return partido;
}
