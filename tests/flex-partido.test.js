import assert from 'node:assert/strict';
import test from 'node:test';
import { hasFlexPartidoConflict, sharedFlexCarrier, verifyFlexPartido } from '../src/lib/flexPartido.js';

const cityHall = { latitude: -34.662495, longitude: -58.364856 };
const shipment = {
    city: 'Avellaneda', province: 'Lanús', partido: 'lanus',
    address: 'Calle Av Mitre 750',
};
const avellanedaResult = {
    altura: { valor: 750 },
    calle: { nombre: 'AV BARTOLOMÉ MITRE' },
    localidad_censal: { nombre: 'Avellaneda' },
    departamento: { nombre: 'Avellaneda' },
    ubicacion: { lat: cityHall.latitude, lon: cityHall.longitude },
};

test('distinguishes an alias that agrees with the label from a conflicting or ambiguous locality', () => {
    assert.equal(hasFlexPartidoConflict({ city: 'El Libertador', province: 'Tres de Febrero' }), false);
    assert.equal(hasFlexPartidoConflict({ city: 'Canning', province: 'Ezeiza' }), true);
    assert.equal(hasFlexPartidoConflict({ city: 'Villa Adelina', province: 'Buenos Aires' }), true);
    assert.equal(hasFlexPartidoConflict({ city: 'Del Viso', province: 'Pilar' }), false);
});

test('uses precise Mercado Libre coordinates before searching by street', async () => {
    const partido = await verifyFlexPartido(shipment, { ...cityHall, geolocation_type: 'ROOFTOP' }, () => {
        assert.fail('A precise match should not need a Georef lookup');
    });
    assert.equal(partido, 'avellaneda');
});

test('confirms an interpolated point through an exact street and height match', async () => {
    let searches = 0;
    const partido = await verifyFlexPartido(shipment, { ...cityHall, geolocation_type: 'RANGE_INTERPOLATED' }, async (url) => {
        searches++;
        assert.equal(url.searchParams.get('direccion'), 'Calle Av Mitre 750');
        assert.equal(url.searchParams.get('localidad'), 'Avellaneda');
        return { ok: true, json: async () => ({ direcciones: [avellanedaResult] }) };
    });
    assert.equal(searches, 1);
    assert.equal(partido, 'avellaneda');
});

test('uses a shared carrier only when every possible mapped partido agrees', async () => {
    const label = { city: 'Villa Adelina', province: 'San Isidro' };
    const carriers = { san_isidro: 'FlexPRO', vicente_lopez: 'FlexPRO', merlo: 'EntregoYa' };
    assert.equal(await sharedFlexCarrier(label, null, partido => carriers[partido]), 'FlexPRO');
    assert.equal(await sharedFlexCarrier(label, null, partido => partido === 'san_isidro' ? 'FlexPRO' : null), null);
    assert.equal(await sharedFlexCarrier(label, { municipality: { name: 'Merlo' } }, partido => carriers[partido]), null);
    assert.equal(await sharedFlexCarrier({ city: 'Villa Adelina' }, null, () => 'FlexPRO'), null);
});

test('leaves partial, contradictory and unavailable address lookups for review', async () => {
    for (const results of [
        [{ ...avellanedaResult, altura: { valor: 751 } }],
        [avellanedaResult, { ...avellanedaResult, departamento: { nombre: 'Lanús' } }],
        [{ ...avellanedaResult, ubicacion: { lat: null, lon: null } }],
    ]) {
        const fetchImpl = async () => ({ ok: true, json: async () => ({ direcciones: results }) });
        assert.equal(await verifyFlexPartido(shipment, null, fetchImpl), null);
    }
    assert.equal(await verifyFlexPartido(shipment, null, async () => { throw new Error('Timed out'); }), null);
});
