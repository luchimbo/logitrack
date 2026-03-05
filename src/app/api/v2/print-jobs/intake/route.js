import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/ensureDb";

const MAX_LABELS = 5000;
const CHUNK_SIZE = 300;

function stringOrNull(value, maxLength = 255) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, maxLength);
}

function intOrDefault(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function asDbValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" || typeof value === "bigint") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return String(value);
}

function uniqueNonEmpty(values) {
  return [...new Set(values.filter(Boolean))];
}

async function getExistingValues(table, column, values) {
  const set = new Set();
  const list = uniqueNonEmpty(values);
  for (let i = 0; i < list.length; i += CHUNK_SIZE) {
    const chunk = list.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");
    const sql = `SELECT ${column} AS value FROM ${table} WHERE ${column} IN (${placeholders})`;
    const result = await db.execute({ sql, args: chunk });
    for (const row of result.rows) {
      if (row.value !== null && row.value !== undefined) {
        set.add(String(row.value));
      }
    }
  }
  return set;
}

function sanitizeSkuOrder(rawSkuOrder, labels) {
  if (Array.isArray(rawSkuOrder) && rawSkuOrder.length) {
    return rawSkuOrder
      .map((x) => ({
        sku: stringOrNull(x?.sku, 120) || "SIN-SKU",
        count: Math.max(0, intOrDefault(x?.count, 0)),
      }))
      .filter((x) => x.count > 0);
  }

  const counts = new Map();
  for (const label of labels) {
    counts.set(label.sku, (counts.get(label.sku) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([sku, count]) => ({ sku, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.sku.localeCompare(b.sku, "es", { sensitivity: "base" });
    });
}

async function getOrCreateTodayBatch(sourceFiles) {
  const filenames = Array.isArray(sourceFiles) ? sourceFiles.filter(Boolean) : [];

  const todayResult = await db.execute("SELECT id, filenames FROM daily_batches WHERE date = CURRENT_DATE");
  if (todayResult.rows.length > 0) {
    const batchId = Number(todayResult.rows[0].id);
    const currentFiles = todayResult.rows[0].filenames
      ? String(todayResult.rows[0].filenames).split(", ").filter(Boolean)
      : [];

    const merged = [...new Set([...currentFiles, ...filenames])];
    await db.execute({
      sql: "UPDATE daily_batches SET filenames = ? WHERE id = ?",
      args: [asDbValue(merged.join(", ")), asDbValue(batchId)],
    });

    return batchId;
  }

  const result = await db.execute({
    sql: "INSERT INTO daily_batches (filenames) VALUES (?)",
    args: [asDbValue(filenames.join(", "))],
  });

  return Number(result.lastInsertRowid);
}

async function insertLegacyShipments(batchId, normalizedLabels) {
  const trackings = uniqueNonEmpty(normalizedLabels.map((x) => x.tracking_number));
  const existing = await getExistingValues("shipments", "tracking_number", trackings);

  let inserted = 0;
  let skipped = 0;

  for (const item of normalizedLabels) {
    if (item.is_reprint === 1) {
      skipped += 1;
      continue;
    }

    if (item.tracking_number && existing.has(item.tracking_number)) {
      skipped += 1;
      continue;
    }

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
        asDbValue(item.sale_type || null),
        asDbValue(item.sale_id),
        asDbValue(item.tracking_number),
        null,
        asDbValue(item.product_name || null),
        asDbValue(item.sku || null),
        null,
        null,
        asDbValue(item.quantity || 1),
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        asDbValue(item.shipping_method || null),
        null,
        null,
        null,
        null,
        null,
      ],
    });

    inserted += 1;
    if (item.tracking_number) {
      existing.add(item.tracking_number);
    }
  }

  await db.execute({
    sql: "UPDATE daily_batches SET total_packages = (SELECT COUNT(*) FROM shipments WHERE batch_id = ?) WHERE id = ?",
    args: [asDbValue(batchId), asDbValue(batchId)],
  });

  return { inserted, skipped };
}

export async function POST(request) {
  try {
    await ensureDb();

    const requiredToken = process.env.PRINT_AGENT_TOKEN;
    if (requiredToken) {
      const providedToken = request.headers.get("x-print-agent-token");
      if (!providedToken || providedToken !== requiredToken) {
        return NextResponse.json({ error: "Unauthorized print agent" }, { status: 401 });
      }
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const jobId = stringOrNull(payload?.job_id, 120);
    if (!jobId) {
      return NextResponse.json({ error: "job_id is required" }, { status: 400 });
    }

    const rawLabels = Array.isArray(payload?.labels) ? payload.labels : [];
    if (!rawLabels.length) {
      return NextResponse.json({ error: "labels array is required" }, { status: 400 });
    }

    if (rawLabels.length > MAX_LABELS) {
      return NextResponse.json({ error: `Too many labels (max ${MAX_LABELS})` }, { status: 400 });
    }

    const existingJob = await db.execute({
      sql: "SELECT id FROM print_jobs WHERE job_id = ?",
      args: [jobId],
    });
    if (existingJob.rows.length > 0) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        job_id: jobId,
        print_job_id: Number(existingJob.rows[0].id),
      });
    }

    const labels = rawLabels.map((raw, index) => ({
      item_order: Math.max(1, intOrDefault(raw?.order, index + 1)),
      sku: stringOrNull(raw?.sku, 120) || "SIN-SKU",
      tracking_number: stringOrNull(raw?.tracking_number, 120),
      label_fingerprint: stringOrNull(raw?.label_fingerprint, 128),
      sale_type: stringOrNull(raw?.sale_type, 50),
      sale_id: stringOrNull(raw?.sale_id, 120),
      product_name: stringOrNull(raw?.product_name, 500),
      quantity: Math.max(1, intOrDefault(raw?.quantity, 1)),
      shipping_method: stringOrNull(raw?.shipping_method, 50),
      client_reprint: Boolean(raw?.is_reprint),
    }));

    const trackingNumbers = labels.map((x) => x.tracking_number);
    const fingerprints = labels.map((x) => x.label_fingerprint);

    const existingShipmentTrackings = await getExistingValues("shipments", "tracking_number", trackingNumbers);
    const existingPrintedTrackings = await getExistingValues("print_job_items", "tracking_number", trackingNumbers);
    const existingFingerprints = await getExistingValues("print_job_items", "label_fingerprint", fingerprints);

    const knownTrackings = new Set([...existingShipmentTrackings, ...existingPrintedTrackings]);
    const seenTrackingsInJob = new Set();
    const seenFingerprintsInJob = new Set();

    const normalizedLabels = labels.map((label) => {
      let isReprint = label.client_reprint;

      if (label.tracking_number) {
        if (knownTrackings.has(label.tracking_number) || seenTrackingsInJob.has(label.tracking_number)) {
          isReprint = true;
        }
        seenTrackingsInJob.add(label.tracking_number);
      }

      if (label.label_fingerprint) {
        if (existingFingerprints.has(label.label_fingerprint) || seenFingerprintsInJob.has(label.label_fingerprint)) {
          isReprint = true;
        }
        seenFingerprintsInJob.add(label.label_fingerprint);
      }

      return {
        ...label,
        is_reprint: isReprint ? 1 : 0,
      };
    });

    const labelsTotal = normalizedLabels.length;
    const skusTotal = new Set(normalizedLabels.map((x) => x.sku)).size;
    const reprintsTotal = normalizedLabels.filter((x) => x.is_reprint === 1).length;

    const sourceFiles = Array.isArray(payload?.source_files)
      ? payload.source_files.map((x) => stringOrNull(x, 260)).filter(Boolean)
      : [];
    const skuOrder = sanitizeSkuOrder(payload?.sku_order, normalizedLabels);

    const batchId = await getOrCreateTodayBatch(sourceFiles);
    const legacyResult = await insertLegacyShipments(batchId, normalizedLabels);

    let insertResult;
    try {
      insertResult = await db.execute({
        sql: `INSERT INTO print_jobs (
          job_id, created_at_client, source_files_json, sku_order_json,
          printer_path, print_file_path, labels_total, skus_total, reprints_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          asDbValue(jobId),
          asDbValue(stringOrNull(payload?.created_at, 60)),
          asDbValue(JSON.stringify(sourceFiles)),
          asDbValue(JSON.stringify(skuOrder)),
          asDbValue(stringOrNull(payload?.printer_path, 600)),
          asDbValue(stringOrNull(payload?.print_file_path, 1000)),
          asDbValue(labelsTotal),
          asDbValue(skusTotal),
          asDbValue(reprintsTotal),
        ],
      });
    } catch (error) {
      const msg = String(error?.message || "");
      if (msg.includes("UNIQUE") && msg.includes("print_jobs.job_id")) {
        const dup = await db.execute({
          sql: "SELECT id FROM print_jobs WHERE job_id = ?",
          args: [jobId],
        });
        return NextResponse.json({
          ok: true,
          duplicate: true,
          job_id: jobId,
          print_job_id: dup.rows.length ? Number(dup.rows[0].id) : null,
        });
      }
      throw error;
    }

    let printJobId = Number(insertResult.lastInsertRowid);
    if (!Number.isFinite(printJobId)) {
      const row = await db.execute({
        sql: "SELECT id FROM print_jobs WHERE job_id = ?",
        args: [jobId],
      });
      printJobId = row.rows.length ? Number(row.rows[0].id) : null;
    }

    if (!Number.isFinite(printJobId)) {
      throw new Error("Could not resolve inserted print job id");
    }

    for (const item of normalizedLabels) {
      await db.execute({
        sql: `INSERT INTO print_job_items (
          print_job_id, item_order, sku, tracking_number, label_fingerprint,
          sale_id, product_name, shipping_method, is_reprint
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          asDbValue(printJobId),
          asDbValue(item.item_order),
          asDbValue(item.sku),
          asDbValue(item.tracking_number),
          asDbValue(item.label_fingerprint),
          asDbValue(item.sale_id),
          asDbValue(item.product_name),
          asDbValue(item.shipping_method),
          asDbValue(item.is_reprint),
        ],
      });
    }

    return NextResponse.json({
      ok: true,
      duplicate: false,
      job_id: jobId,
      print_job_id: printJobId,
      batch_id: batchId,
      labels_total: labelsTotal,
      reprints_total: reprintsTotal,
      unique_skus_total: skusTotal,
      shipments_inserted: legacyResult.inserted,
      shipments_skipped: legacyResult.skipped,
    });
  } catch (error) {
    console.error("V2 intake error:", error);
    return NextResponse.json({ error: "Failed to ingest print job" }, { status: 500 });
  }
}
