import { db } from "./db.js";
import { isLabelScheduleValue } from "./dispatchDate.js";
import { parseZplFile } from "./zplParser.js";
import { bumpFlexPortalRevision } from "./flexPortal.js";

// Las etiquetas Flex nuevas imprimen la franja de entrega ("hasta las 21 hs") justo arriba del
// SKU, y el parser viejo la guardaba como producto. Esto vuelve a leer la etiqueta guardada y
// corrige el producto. Es idempotente: una vez corregidos, la consulta ya no los encuentra.
export const SCHEDULE_PRODUCT_SQL = `(LOWER(TRIM(product_name)) LIKE 'hasta %'
  OR LOWER(TRIM(product_name)) LIKE 'desde %'
  OR LOWER(TRIM(product_name)) LIKE 'entre %'
  OR LOWER(TRIM(product_name)) LIKE 'antes de %'
  OR LOWER(TRIM(product_name)) LIKE 'de %hs%')`;

function isMissing(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return !normalized || normalized === "SIN-SKU" || normalized === "N/A";
}

function reparse(rawZpl) {
  const text = String(rawZpl || "").trim();
  if (!text) return null;
  // print_job_items.raw_block puede venir sin ^XA/^XZ.
  const zpl = `${text.startsWith("^XA") ? "" : "^XA"}${text}${text.endsWith("^XZ") ? "" : "^XZ"}`;
  try {
    return parseZplFile(zpl)[0] || null;
  } catch {
    return null;
  }
}

function recoveredProduct(row, rawZpl) {
  const recovered = reparse(rawZpl);
  const name = recovered?.product_name;
  if (!isMissing(name) && !isLabelScheduleValue(name)) return { name, recovered };
  // Sin etiqueta legible: el SKU identifica mejor el producto que la franja horaria.
  if (!isMissing(row.sku)) return { name: row.sku, recovered };
  return null;
}

export async function repairScheduleProductNames({ workspaceId = null } = {}) {
  const scope = workspaceId ? " AND workspace_id = ?" : "";
  const scopeArgs = workspaceId ? [workspaceId] : [];
  const touched = new Set();
  let shipments = 0;
  let printItems = 0;

  const shipmentRows = await db.execute({
    sql: `SELECT id, workspace_id, sku, product_name, color, voltage, raw_zpl FROM shipments
          WHERE ${SCHEDULE_PRODUCT_SQL}${scope}`,
    args: scopeArgs,
  });
  for (const row of shipmentRows.rows || []) {
    if (!isLabelScheduleValue(row.product_name)) continue;
    const fix = recoveredProduct(row, row.raw_zpl);
    if (!fix) continue;
    const { recovered } = fix;
    await db.execute({
      sql: "UPDATE shipments SET product_name = ?, sku = ?, color = ?, voltage = ? WHERE id = ?",
      args: [
        fix.name,
        isMissing(row.sku) && !isMissing(recovered?.sku) ? recovered.sku : row.sku,
        isMissing(row.color) && !isMissing(recovered?.color) ? recovered.color : row.color,
        isMissing(row.voltage) && !isMissing(recovered?.voltage) ? recovered.voltage : row.voltage,
        row.id,
      ],
    });
    shipments += 1;
    if (row.workspace_id) touched.add(Number(row.workspace_id));
  }

  const itemRows = await db.execute({
    sql: `SELECT id, sku, product_name, raw_block FROM print_job_items
          WHERE ${SCHEDULE_PRODUCT_SQL}${scope}`,
    args: scopeArgs,
  });
  for (const row of itemRows.rows || []) {
    if (!isLabelScheduleValue(row.product_name)) continue;
    const fix = recoveredProduct(row, row.raw_block);
    if (!fix) continue;
    await db.execute({ sql: "UPDATE print_job_items SET product_name = ? WHERE id = ?", args: [fix.name, row.id] });
    printItems += 1;
  }

  for (const id of touched) await bumpFlexPortalRevision(db, id);
  return { shipments, printItems };
}
