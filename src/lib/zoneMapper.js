import { db } from "./db";
import { ensureDb } from "./ensureDb";

export function normalizeName(name) {
    if (!name) return "";
    let s = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    s = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return s;
}

function canonicalPartido(normName) {
    const s = String(normName || "");
    if (!s) return "";

    if (s.includes("la_matanza_sur")) return "la_matanza_sur";
    if (s.includes("la_matanza_norte")) return "la_matanza_norte";
    if (s.includes("la_matanza")) return "la_matanza";
    if (s.includes("villa_rosa") || s.includes("matheu")) return "villa_rosa";
    if (s.includes("dique_lujan")) return "dique_lujan";
    if (s.includes("ingeniero_maschwitz")) return "ingeniero_maschwitz";

    return s;
}

export async function assignCarrier(partido) {
    if (!partido) return null;
    await ensureDb();
    const normPartido = canonicalPartido(normalizeName(partido));
    const result = await db.execute({
        sql: "SELECT carrier_name FROM zone_mappings WHERE partido = ?",
        args: [normPartido]
    });
    if (result.rows.length > 0) {
        return result.rows[0].carrier_name;
    }
    return null;
}

export async function getAllZones() {
    await ensureDb();
    const result = await db.execute("SELECT id, partido, carrier_name FROM zone_mappings ORDER BY partido");
    return result.rows;
}
