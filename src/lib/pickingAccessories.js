// Qué fuente o cable hay que sumar a cada producto al armar el picking.
// Datos del listado "fuentes.pdf" de PC MIDI. Se busca primero por SKU y, si el
// SKU no está cargado, por el nombre de la publicación.

function supply(voltage, current, connector) {
    return `Fuente ${voltage}V ${current}${connector ? ` · ${connector} mm` : ""}`;
}

const THIN = "5.5×2.1";
const WIDE = "5.5×2.5";
const SMALL = "3.5×1.35";
const INTERLOCK = "Cable interlock (Schuko)";

// Orden importante: los modelos más específicos van antes que los genéricos.
const RULES = [
    // Kressmer: todos 9V 2A salvo el K88; el 3008 no lleva nada.
    { name: /kressmer.*\b3008\b/, accessory: null, skus: ["KRE006"] },
    { name: /kressmer.*\bk ?88\b/, accessory: supply(12, "2A"), skus: ["KRE005"] },
    { name: /piano.*kressmer|kressmer.*piano/, accessory: supply(9, "2A"), skus: ["KRE001", "KRE002", "KRE003", "KRE004"] },

    { name: /meike.*\b(mk ?)?(4100|4300|2702)\b/, accessory: supply(9, "500 mA", THIN), skus: ["MKT015", "MKT008"] },
    { name: /meike.*\b(mk ?)?(809|812|885|922|935|939)\b/, accessory: supply(12, "500 mA", THIN), skus: ["MKT027", "MKT006", "MKT012", "MKT007", "MKT016", "MKT001"] },
    { name: /meike.*\b(mk ?)?8861\b/, accessory: supply(12, "500 mA"), skus: ["MKT033"] },

    { name: /midiplus.*\b(ed ?9 ?pro|ed ?8|ed ?6|md ?200 ?ultra|md ?200 ?l)\b/, accessory: supply(9, "1A", THIN), skus: ["ZRR070", "ZRR069", "ZRR068", "MOI003"] },
    { name: /midiplus.*easy ?piano/, accessory: supply(9, "2A", THIN), skus: ["ZAT218", "ZTT045"] },
    { name: /midiplus.*octapad|octapad.*midiplus/, accessory: supply(12, "1A", THIN), skus: ["MOI006"] },

    { name: /arturia.*mini ?brute ?2 ?s?\b/, accessory: supply(12, "2.5A", THIN), skus: ["ZTO147"] },
    { name: /arturia.*(key ?step ?pro|drum ?brute|mini ?brute|micro ?brute|micro ?freak|mini ?freak)/, accessory: supply(12, "1A", THIN), skus: ["ZTO108", "ZTO114", "ZTO099", "ZTO100", "ZTO116", "ZTO159"] },
    { name: /arturia.*astro ?lab ?37\b/, accessory: supply(12, "2A", WIDE), skus: ["ZTO163"] },
    { name: /arturia.*astro ?lab ?(61|88)\b/, accessory: supply(12, "3A", WIDE), skus: ["ZTO174"] },
    { name: /arturia.*mini ?fuse ?4\b/, accessory: supply(15, "1A", SMALL), skus: ["ZTO021", "ZTO022"] },
    { name: /arturia.*audio ?fuse.*(8 ?pre|\bx8\b)/, accessory: supply(15, "2A", WIDE), skus: [] },
    { name: /arturia.*(rack ?brute.*\b[36] ?u\b|audio ?fuse ?(studio|16 ?rig))/, accessory: supply(15, "3A", WIDE), skus: ["ZTO138", "ZTO125", "ZTO137"] },
    { name: /arturia.*audio ?fuse.*\brev ?[12]\b/, accessory: supply(18, "1.6A", SMALL), skus: [] },
    { name: /arturia.*(matrix ?brute|poly ?brute)/, accessory: INTERLOCK, skus: ["ZTO016", "ZTO023"] },
];

// Publicaciones que nombran un modelo pero son un accesorio suyo.
const ACCESSORY_LISTING = /^(microfono|atril|funda|soporte|cable|merch|remera|gorra)\b/;
// Las licencias de software llevan el nombre del instrumento pero no se envían con fuente.
const SOFTWARE_LISTING = /\b(software|licencia|plugin)\b/;

const RULE_BY_SKU = new Map(RULES.flatMap((rule) => rule.skus.map((sku) => [sku, rule])));

function normalize(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[-_]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function split(value) {
    return String(value || "").split("|").map((part) => part.trim());
}

function findRule(sku, name) {
    const bySku = RULE_BY_SKU.get(sku.toUpperCase());
    if (bySku) return bySku;
    const normalized = normalize(name);
    if (ACCESSORY_LISTING.test(normalized) || SOFTWARE_LISTING.test(normalized)) return null;
    return RULES.find((rule) => rule.name.test(normalized)) || null;
}

// Devuelve una línea por cada producto del ítem que necesita algo (los envíos
// con varios productos llegan como "SKU1 | SKU2" y "Nombre 1 | Nombre 2").
export function getPickingAccessories({ product_name: productName, sku } = {}) {
    const skus = split(sku);
    const names = split(productName);
    const count = Math.max(skus.length, names.length);
    const accessories = [];

    for (let i = 0; i < count; i += 1) {
        const rule = findRule(skus[i] || "", names[i] || "");
        if (rule?.accessory) accessories.push(rule.accessory);
    }

    return accessories;
}
