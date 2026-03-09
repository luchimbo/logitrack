import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/ensureDb";

function asDbValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" || typeof value === "bigint") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return String(value);
}

function stringOrNull(value, maxLength = 255) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, maxLength);
}

function extractDateOnly(value) {
  const s = stringOrNull(value, 60);
  if (!s) return null;
  const datePart = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return datePart;
  }
  return null;
}

function parseJsonOrFallback(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function getOrCreateBatch(sourceFiles, batchDate = null) {
  const filenames = Array.isArray(sourceFiles) ? sourceFiles.filter(Boolean) : [];
  const dateValue = extractDateOnly(batchDate) || new Date().toISOString().slice(0, 10);

  const existing = await db.execute({
    sql: "SELECT id, filenames FROM daily_batches WHERE date = ?",
    args: [asDbValue(dateValue)],
  });

  if (existing.rows.length > 0) {
    const batchId = Number(existing.rows[0].id);
    const currentFiles = existing.rows[0].filenames
      ? String(existing.rows[0].filenames).split(", ").filter(Boolean)
      : [];

    const merged = [...new Set([...currentFiles, ...filenames])];
    await db.execute({
      sql: "UPDATE daily_batches SET filenames = ? WHERE id = ?",
      args: [asDbValue(merged.join(", ")), asDbValue(batchId)],
    });

    return batchId;
  }

  const created = await db.execute({
    sql: "INSERT INTO daily_batches (date, filenames) VALUES (?, ?)",
    args: [asDbValue(dateValue), asDbValue(filenames.join(", "))],
  });

  return Number(created.lastInsertRowid);
}

async function runBackfill(request) {
  try {
    await ensureDb();

    const requiredToken = process.env.PRINT_AGENT_TOKEN;
    if (requiredToken) {
      const providedToken = request.headers.get("x-print-agent-token");
      if (!providedToken || providedToken !== requiredToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const missingResult = await db.execute(`SELECT
      pji.tracking_number,
      pji.sku,
      pji.sale_id,
      pji.product_name,
      pji.shipping_method,
      pji.is_reprint,
      pj.created_at_client,
      pj.source_files_json
    FROM print_job_items pji
    JOIN print_jobs pj ON pj.id = pji.print_job_id
    LEFT JOIN shipments s ON s.tracking_number = pji.tracking_number
    WHERE pji.tracking_number IS NOT NULL
      AND s.id IS NULL
    ORDER BY pji.id ASC`);

    const rows = missingResult.rows || [];
    if (!rows.length) {
      return NextResponse.json({ ok: true, inserted: 0, batches_updated: 0, candidates: 0 });
    }

    const batchCache = new Map();
    const seenTrackings = new Set();
    const touchedBatchIds = new Set();
    let inserted = 0;
    let failed = 0;

    for (const row of rows) {
      const tracking = stringOrNull(row.tracking_number, 120);
      if (!tracking || seenTrackings.has(tracking)) continue;
      seenTrackings.add(tracking);

      const productName =
        stringOrNull(row.product_name, 500) ||
        stringOrNull(row.sku, 120) ||
        tracking ||
        "Etiqueta sin producto";

      const sourceFiles = parseJsonOrFallback(row.source_files_json, []);
      const batchDate = extractDateOnly(row.created_at_client);
      const batchKey = `${batchDate || ""}|${JSON.stringify(sourceFiles)}`;

      let batchId = batchCache.get(batchKey);
      if (!batchId) {
        batchId = await getOrCreateBatch(sourceFiles, batchDate);
        batchCache.set(batchKey, batchId);
      }

      try {
        await db.execute({
          sql: `INSERT INTO shipments (
            batch_id, sale_type, sale_id, tracking_number, remitente_id,
            product_name, sku, color, voltage, quantity,
            recipient_name, recipient_user, address, postal_code,
            city, partido, province, reference, shipping_method,
            carrier_code, carrier_name, assigned_carrier,
            dispatch_date, delivery_date, status
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, 'pendiente'
          )`,
          args: [
            asDbValue(batchId),
            null,
            asDbValue(stringOrNull(row.sale_id, 120)),
            asDbValue(tracking),
            null,
            asDbValue(productName),
            asDbValue(stringOrNull(row.sku, 120)),
            null,
            null,
            1,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            asDbValue(stringOrNull(row.shipping_method, 50)),
            null,
            null,
            null,
            null,
            null,
          ],
        });

        inserted += 1;
        touchedBatchIds.add(batchId);
      } catch (e) {
        failed += 1;
      }
    }

    for (const batchId of touchedBatchIds) {
      await db.execute({
        sql: "UPDATE daily_batches SET total_packages = (SELECT COUNT(*) FROM shipments WHERE batch_id = ?) WHERE id = ?",
        args: [asDbValue(batchId), asDbValue(batchId)],
      });
    }

    return NextResponse.json({
      ok: true,
      inserted,
      failed,
      batches_updated: touchedBatchIds.size,
      candidates: rows.length,
    });
  } catch (error) {
    console.error("V2 backfill error:", error);
    return NextResponse.json({ error: "Failed to backfill legacy shipments" }, { status: 500 });
  }
}

export async function POST(request) {
  return runBackfill(request);
}

export async function GET(request) {
  return NextResponse.json({ error: "Use POST to run backfill" }, { status: 405 });
}
