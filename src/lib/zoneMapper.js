import { db } from "./db";

export function normalizeName(name) {
    if (!name) return "";
    let s = name.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remove accents
    s = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return s;
}

export async function assignCarrier(partido) {
    if (!partido) return null;
    const normPartido = normalizeName(partido);
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
    const result = await db.execute("SELECT id, partido, carrier_name FROM zone_mappings ORDER BY partido");
    return result.rows;
}

// Ensure the db is initialized in serverless environments when importing db modules
import { initDb } from "./dbInit";
initDb();
