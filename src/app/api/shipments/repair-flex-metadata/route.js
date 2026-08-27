import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';
import { getArgentinaDateString } from '@/lib/dateUtils';
import { parseZplFile } from '@/lib/zplParser';

function isMissingMetadata(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return !normalized || normalized === 'SIN-SKU' || normalized === 'N/A';
}

function isDispatchDateValue(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return /^(?:0?[1-9]|[12]\d|3[01])(?:\s|-)(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/.test(normalized);
}

function parseStoredLabel(rawZpl) {
  if (!rawZpl) return null;
  try {
    return parseZplFile(String(rawZpl))[0] || null;
  } catch {
    return null;
  }
}

// Repara el lote operativo de los últimos días y sólo campos incompletos o
// contaminados. No inserta filas ni altera envíos cuyos datos ya estén completos.
const REPAIR_WINDOW_DAYS = 7;
export async function POST(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const workspaceId = authResult.actor.workspaceId;
    const today = getArgentinaDateString();
    const windowStart = getArgentinaDateString(new Date(Date.now() - (REPAIR_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000));
    const result = await db.execute({
      sql: `SELECT s.id, s.sku, s.product_name, s.color, s.voltage, s.raw_zpl
            FROM shipments s
            JOIN daily_batches b ON b.id = s.batch_id AND b.workspace_id = s.workspace_id
            WHERE s.workspace_id = ?
              AND b.date >= ?
              AND LOWER(COALESCE(s.shipping_method, '')) = 'flex'
              AND s.raw_zpl IS NOT NULL
              AND TRIM(s.raw_zpl) != ''
              AND (
                s.sku IS NULL OR TRIM(s.sku) = '' OR UPPER(TRIM(s.sku)) = 'SIN-SKU'
                OR s.product_name IS NULL OR TRIM(s.product_name) = '' OR UPPER(TRIM(s.product_name)) = 'SIN-SKU'
                OR UPPER(TRIM(s.product_name)) GLOB '[0-3][0-9] [A-Z][A-Z][A-Z]'
              )`,
      args: [workspaceId, windowStart],
    });

    let updated = 0;
    let parsed = 0;
    let unchanged = 0;
    for (const row of result.rows || []) {
      const recovered = parseStoredLabel(row.raw_zpl);
      if (!recovered) {
        unchanged += 1;
        continue;
      }
      parsed += 1;

      const nextSku = isMissingMetadata(row.sku) && !isMissingMetadata(recovered.sku) ? recovered.sku : row.sku;
      const nextProductName = (isMissingMetadata(row.product_name) || isDispatchDateValue(row.product_name)) && !isMissingMetadata(recovered.product_name)
        ? recovered.product_name
        : row.product_name;
      const nextColor = isMissingMetadata(row.color) && !isMissingMetadata(recovered.color) ? recovered.color : row.color;
      const nextVoltage = isMissingMetadata(row.voltage) && !isMissingMetadata(recovered.voltage) ? recovered.voltage : row.voltage;

      if (nextSku === row.sku && nextProductName === row.product_name && nextColor === row.color && nextVoltage === row.voltage) {
        unchanged += 1;
        continue;
      }

      await db.execute({
        sql: `UPDATE shipments
              SET sku = ?, product_name = ?, color = ?, voltage = ?
              WHERE id = ? AND workspace_id = ?`,
        args: [nextSku, nextProductName, nextColor, nextVoltage, row.id, workspaceId],
      });
      updated += 1;
    }

    return NextResponse.json({ ok: true, windowStart, date: today, candidates: result.rows?.length || 0, parsed, updated, unchanged });
  } catch (error) {
    console.error('Error repairing Flex metadata:', error);
    return NextResponse.json({ error: 'Failed to repair Flex metadata' }, { status: 500 });
  }
}
