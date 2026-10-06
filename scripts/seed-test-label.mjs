// Inserta un "paquete inventado" en producción (workspace 1 = GeoModi / camilopcmidi)
// para probar el flujo completo pagina -> cola -> agente --watch -> impresora.
//
// Uso:
//   node scripts/seed-test-label.mjs          -> inserta y muestra el id
//   node scripts/seed-test-label.mjs --clean  -> borra todos los paquetes de prueba
import { createClient } from "@libsql/client";
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const db = createClient({
  url: env.TURSO_DATABASE_URL_PROD,
  authToken: env.TURSO_AUTH_TOKEN_PROD,
});

const WORKSPACE_ID = 1; // camilopcmidi -> GeoModi
const TEST_SKU = "PRUEBA-TEST";

if (process.argv.includes("--clean")) {
  const res = await db.execute({
    sql: `DELETE FROM shipments WHERE workspace_id = ? AND sku = ?`,
    args: [WORKSPACE_ID, TEST_SKU],
  });
  console.log(`Paquetes de prueba borrados: ${res.rowsAffected}`);
  process.exit(0);
}

const stamp = new Date();
const tracking = `TEST${stamp.getTime()}`;
const fecha = stamp.toISOString().slice(0, 10);

// Etiqueta ZPL de un solo bloido, 203dpi, ~10x15. Claramente marcada como PRUEBA.
const rawZpl = `^XA
^CI28
^LH0,30
^FO40,40^A0N,55,55^FDETIQUETA DE PRUEBA^FS
^FO40,110^A0N,35,35^FDGeoModi - Test de impresion^FS
^FO40,170^GB740,2,2^FS
^FO40,200^A0N,32,32^FDSKU: ${TEST_SKU}^FS
^FO40,250^A0N,32,32^FDPaquete inventado (no despachar)^FS
^FO40,300^A0N,30,30^FDTracking: ${tracking}^FS
^FO40,360^BY3^BCN,130,Y,N,N^FD${tracking}^FS
^FO40,540^A0N,28,28^FDFecha: ${fecha}^FS
^FO40,580^GB740,2,2^FS
^XZ`;

const res = await db.execute({
  sql: `INSERT INTO shipments
        (workspace_id, sale_type, tracking_number, product_name, sku, quantity,
         recipient_name, address, city, province, shipping_method, status, raw_zpl)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  args: [
    WORKSPACE_ID,
    "PRUEBA",
    tracking,
    "🧪 PRUEBA IMPRESION - paquete inventado",
    TEST_SKU,
    1,
    "Cliente de Prueba",
    "Calle Falsa 123",
    "Ciudad Test",
    "Buenos Aires",
    "flex",
    "pendiente",
    rawZpl,
  ],
});

console.log("Paquete de prueba insertado");
console.log("  shipment id :", Number(res.lastInsertRowid));
console.log("  tracking    :", tracking);
console.log("  workspace   :", WORKSPACE_ID, "(camilopcmidi / GeoModi)");
console.log("\nBuscalo en la pagina como '🧪 PRUEBA IMPRESION' y toca Imprimir.");
console.log("Para borrarlo despues: node scripts/seed-test-label.mjs --clean");
