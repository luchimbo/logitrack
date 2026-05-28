/**
 * Account detection for Colecta shipments.
 *
 * Mercado Libre colecta labels carry a "Remitente #" number (remitente_id) that
 * uniquely identifies the seller account. The user operates two accounts:
 *   - ATO: the account that ships Arturia products (Minilab, Minifuse, etc.)
 *   - PCM: the account that does NOT ship Arturia products
 *
 * We can't know which remitente number is which up front, but we can deduce it:
 * any remitente that ships at least one Arturia product is ATO; every other
 * remitente is PCM. Once a remitente is flagged as ATO, ALL of its shipments are
 * labelled ATO (even non-Arturia ones), which is more reliable than classifying
 * product by product.
 */

export const ACCOUNT_ATO = 'ATO';
export const ACCOUNT_PCM = 'PCM';
export const ACCOUNT_UNKNOWN = 'Sin identificar';

// Keywords that mark a product as Arturia (case-insensitive, accent-insensitive).
// Add models here if a new Arturia product is missed.
const ARTURIA_KEYWORDS = [
    'arturia',
    'minilab',
    'minifuse',
    'microfreak',
    'minifreak',
    'keystep',
    'keylab',
    'beatstep',
    'polybrute',
    'microbrute',
    'minibrute',
    'matrixbrute',
    'audiofuse',
    'pigments',
];

function normalize(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
}

export function isArturiaProduct(productName) {
    const text = normalize(productName);
    if (!text) return false;
    return ARTURIA_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * Given a list of shipments (each with remitente_id and product_name), return the
 * set of remitente_id values that belong to the Arturia (ATO) account.
 */
export function resolveAtoRemitentes(shipments = []) {
    const atoRemitentes = new Set();
    for (const s of shipments) {
        const remitente = s?.remitente_id ? String(s.remitente_id) : '';
        if (remitente && isArturiaProduct(s?.product_name)) {
            atoRemitentes.add(remitente);
        }
    }
    return atoRemitentes;
}

/**
 * Classify a single shipment into an account label, given the precomputed set of
 * ATO remitentes for the current dataset.
 */
export function accountForShipment(shipment, atoRemitentes) {
    const remitente = shipment?.remitente_id ? String(shipment.remitente_id) : '';
    if (!remitente) return ACCOUNT_UNKNOWN;
    return atoRemitentes.has(remitente) ? ACCOUNT_ATO : ACCOUNT_PCM;
}
