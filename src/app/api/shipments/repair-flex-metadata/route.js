import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';
import { getArgentinaDateString } from '@/lib/dateUtils';
import { parseZplFile } from '@/lib/zplParser';
import { isDispatchDateValue } from '@/lib/dispatchDate';

function isMissingMetadata(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return !normalized || normalized === 'SIN-SKU' || normalized === 'N/A';
}

function parseStoredLabel(rawZpl) {
  if (!rawZpl) return null;
  try {
    return parseZplFile(String(rawZpl))[0] || null;
  } catch {
    return null;
  }
}

// Repara envíos Flex con metadatos incompletos o contaminados (fechas de
// despacho como "27 AUG" guardadas como producto). Acepta ?days=N para el
// histórico a revisar (por defecto 7; days<=0 revisa todo el histórico).
// Sin raw_zpl, cae a SKU como nombre; sin SKU, deja product_name en NULL.
const DEFAULT_WINDOW_DAYS = 7;
export async function POST(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const url = new URL(request.url);
    const daysParam = Number(url.searchParams.get('days'));
    const windowDays = Number.isFinite(daysParam) ? daysParam : DEFAULT_WINDOW_DAYS;

    const workspaceId = authResult.actor.workspaceId;
    const today = getArgentinaDateString();
    const hasWindow = windowDays > 0;
    const windowStart = hasWindow
      ? getArgentinaDateString(new Date(Date.now() - (windowDays - 1) * 24 * 60 * 60 * 1000))
      : null;

    const sqlParts = [
      `SELECT s.id, s.sku, s.product_name, s.color, s.voltage, s.raw_zpl
            FROM shipments s
            JOIN daily_batches b ON b.id = s.batch_id AND b.workspace_id = s.workspace_id
            WHERE s.workspace_id = ?`,
    ];
    const sqlArgs = [workspaceId];
    if (hasWindow) {
      sqlParts.push(`AND b.date >= ?`);
      sqlArgs.push(windowStart);
    }
    sqlParts.push(
      `AND LOWER(COALESCE(s.shipping_method, '')) = 'flex'
              AND (
                s.sku IS NULL OR TRIM(s.sku) = '' OR UPPER(TRIM(s.sku)) = 'SIN-SKU'
                OR s.product_name IS NULL OR TRIM(s.product_name) = '' OR UPPER(TRIM(s.product_name)) = 'SIN-SKU'
                OR UPPER(TRIM(s.product_name)) GLOB '[0-3][0-9] [A-Z][A-Z][A-Z]*'
                OR UPPER(TRIM(s.product_name)) GLOB '[A-Z][A-Z][A-Z] [0-3][0-9]'
              )`
    );
    const result = await db.execute({ sql: sqlParts.join(' '), args: sqlArgs });

    let updated = 0;
    let parsed = 0;
    let skuFallbacks = 0;
    let unchanged = 0;
    for (const row of result.rows || []) {
      const recovered = parseStoredLabel(row.raw_zpl);
      if (recovered) parsed += 1;

      const nextSku = isMissingMetadata(row.sku) && recovered && !isMissingMetadata(recovered.sku) ? recovered.sku : row.sku;
      const nextProductName = isMissingMetadata(row.product_name) || isDispatchDateValue(row.product_name)
        ? (!isMissingMetadata(recovered?.product_name) ? recovered.product_name
          : !isMissingMetadata(row.sku) ? row.sku
          : null)
        : row.product_name;
      if (nextProductName !== row.product_name && isMissingMetadata(recovered?.product_name) && nextProductName === row.sku) skuFallbacks += 1;
      const nextColor = isMissingMetadata(row.color) && recovered && !isMissingMetadata(recovered.color) ? recovered.color : row.color;
      const nextVoltage = isMissingMetadata(row.voltage) && recovered && !isMissingMetadata(recovered.voltage) ? recovered.voltage : row.voltage;

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

    return NextResponse.json({ ok: true, windowStart, date: today, candidates: result.rows?.length || 0, parsed, updated, skuFallbacks, unchanged });
  } catch (error) {
    console.error('Error repairing Flex metadata:', error);
    return NextResponse.json({ error: 'Failed to repair Flex metadata' }, { status: 500 });
  }
}
