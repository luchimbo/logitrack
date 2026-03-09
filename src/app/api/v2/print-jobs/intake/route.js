import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/ensureDb";
import { parseZplFile } from "@/lib/zplParser";
import { assignCarrier } from "@/lib/zoneMapper";

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

function extractDateOnly(value) {
  const s = stringOrNull(value, 60);
  if (!s) return null;
  const datePart = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return datePart;
  }
  return null;
}

async function getOrCreateBatch(sourceFiles, batchDate = null) {
  const filenames = Array.isArray(sourceFiles) ? sourceFiles.filter(Boolean) : [];
  const dateValue = extractDateOnly(batchDate) || new Date().toISOString().slice(0, 10);

  const todayResult = await db.execute({
    sql: "SELECT id, filenames FROM daily_batches WHERE date = ?",
    args: [asDbValue(dateValue)],
  });
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
    sql: "INSERT INTO daily_batches (date, filenames) VALUES (?, ?)",
    args: [asDbValue(dateValue), asDbValue(filenames.join(", "))],
  });

  return Number(result.lastInsertRowid);
}

function pickFirst(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      const s = value.trim();
      if (!s) continue;
      return s;
    }
    return value;
  }
  return null;
}

function parseShipmentFromRawBlock(rawBlock) {
  const block = stringOrNull(rawBlock, 40000);
  if (!block) return null;

  try {
    const parsed = parseZplFile(`^XA${block}^XZ`);
    return parsed[0] || null;
  } catch {
    return null;
  }
}

function computeLabelFingerprint(rawBlock) {
  const normalized = String(rawBlock || "")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(normalized).digest("hex");
}

function buildFingerprintCounter(fingerprints) {
  const counter = new Map();
  for (const fp of fingerprints) {
    const key = stringOrNull(fp, 128);
    if (!key) continue;
    counter.set(key, (counter.get(key) || 0) + 1);
  }
  return counter;
}

function fingerprintDigestFromCounter(counter) {
  const serialized = Array.from(counter.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fp, count]) => `${fp}:${count}`)
    .join("|");
  return createHash("sha256").update(serialized).digest("hex");
}

function validateIntakeContract(payload, rawLabels) {
  const agentVersion = stringOrNull(payload?.agent_version, 80);
  if (!agentVersion) {
    return { ok: false, status: 422, error: "agent_version is required" };
  }

  const integrity = payload?.integrity;
  if (!integrity || typeof integrity !== "object") {
    return { ok: false, status: 422, error: "integrity payload is required" };
  }

  const checkVersion = stringOrNull(integrity.check_version, 80);
  if (checkVersion !== "fingerprint-multiset-v1") {
    return { ok: false, status: 422, error: "Unsupported integrity check version" };
  }

  const inputBlocksCount = Math.max(0, intOrDefault(integrity.input_blocks_count, 0));
  const outputBlocksCount = Math.max(0, intOrDefault(integrity.output_blocks_count, 0));
  const inputFingerprintHash = stringOrNull(integrity.input_fingerprint_hash, 128);
  const outputFingerprintHash = stringOrNull(integrity.output_fingerprint_hash, 128);

  if (!inputBlocksCount || !outputBlocksCount) {
    return { ok: false, status: 422, error: "Invalid integrity block counts" };
  }

  if (integrity.passed !== true) {
    return { ok: false, status: 422, error: "Client integrity check did not pass" };
  }

  if (!inputFingerprintHash || !outputFingerprintHash) {
    return { ok: false, status: 422, error: "Integrity fingerprints are required" };
  }

  if (inputBlocksCount !== outputBlocksCount) {
    return { ok: false, status: 422, error: "Input/output block count mismatch in integrity payload" };
  }

  if (outputBlocksCount !== rawLabels.length) {
    return {
      ok: false,
      status: 422,
      error: `Label count mismatch. payload=${rawLabels.length} integrity=${outputBlocksCount}`,
    };
  }

  const computedFingerprints = [];
  for (let i = 0; i < rawLabels.length; i += 1) {
    const raw = rawLabels[i] || {};
    const rawBlock = stringOrNull(raw.raw_block, 40000);
    if (!rawBlock) {
      return { ok: false, status: 422, error: `labels[${i}].raw_block is required` };
    }

    const providedFingerprint = stringOrNull(raw.label_fingerprint, 128);
    if (!providedFingerprint) {
      return { ok: false, status: 422, error: `labels[${i}].label_fingerprint is required` };
    }

    const computedFingerprint = computeLabelFingerprint(rawBlock);
    if (providedFingerprint !== computedFingerprint) {
      return {
        ok: false,
        status: 422,
        error: `labels[${i}] fingerprint mismatch`,
      };
    }

    computedFingerprints.push(computedFingerprint);
  }

  const computedOutputHash = fingerprintDigestFromCounter(buildFingerprintCounter(computedFingerprints));

  if (computedOutputHash !== outputFingerprintHash) {
    return { ok: false, status: 422, error: "Output fingerprint hash mismatch" };
  }

  if (inputFingerprintHash !== outputFingerprintHash) {
    return { ok: false, status: 422, error: "Input/output fingerprint hash mismatch" };
  }

  return {
    ok: true,
    agentVersion,
    integrity: {
      check_version: checkVersion,
      input_blocks_count: inputBlocksCount,
      output_blocks_count: outputBlocksCount,
      input_fingerprint_hash: inputFingerprintHash,
      output_fingerprint_hash: outputFingerprintHash,
      computed_output_fingerprint_hash: computedOutputHash,
      parser_misses: Math.max(0, intOrDefault(integrity.parser_misses, 0)),
    },
  };
}

async function insertLegacyShipments(batchId, normalizedLabels) {
  const trackings = uniqueNonEmpty(normalizedLabels.map((x) => x.tracking_number));
  const existing = await getExistingValues("shipments", "tracking_number", trackings);

  let inserted = 0;
  let skipped = 0;
  let recoveredFromReprint = 0;

  for (const item of normalizedLabels) {
    const itemTracking = stringOrNull(item.tracking_number, 120);

    if (itemTracking && existing.has(itemTracking)) {
      skipped += 1;
      continue;
    }

    // If it is marked as reprint but the shipment does not exist in legacy table,
    // recover it to avoid operational gaps after cleanups/migrations.
    if (item.is_reprint === 1 && !itemTracking) {
      skipped += 1;
      continue;
    }

    if (item.is_reprint === 1 && itemTracking && !existing.has(itemTracking)) {
      recoveredFromReprint += 1;
    }

    const parsedShipment = parseShipmentFromRawBlock(item.raw_block);

    const shipment = {
      sale_type: pickFirst(parsedShipment?.sale_type, item.sale_type),
      sale_id: pickFirst(parsedShipment?.sale_id, item.sale_id),
      tracking_number: pickFirst(parsedShipment?.tracking_number, item.tracking_number),
      remitente_id: pickFirst(parsedShipment?.remitente_id, item.remitente_id),
      product_name: pickFirst(parsedShipment?.product_name, item.product_name),
      sku: pickFirst(parsedShipment?.sku, item.sku),
      color: pickFirst(parsedShipment?.color, item.color),
      voltage: pickFirst(parsedShipment?.voltage, item.voltage),
      quantity: Math.max(1, intOrDefault(pickFirst(parsedShipment?.quantity, item.quantity), 1)),
      recipient_name: pickFirst(parsedShipment?.recipient_name, item.recipient_name),
      recipient_user: pickFirst(parsedShipment?.recipient_user, item.recipient_user),
      address: pickFirst(parsedShipment?.address, item.address),
      postal_code: pickFirst(parsedShipment?.postal_code, item.postal_code),
      city: pickFirst(parsedShipment?.city, item.city),
      partido: pickFirst(parsedShipment?.partido, item.partido),
      province: pickFirst(parsedShipment?.province, item.province),
      reference: pickFirst(parsedShipment?.reference, item.reference),
      shipping_method: pickFirst(parsedShipment?.shipping_method, item.shipping_method),
      carrier_code: pickFirst(parsedShipment?.carrier_code, item.carrier_code),
      carrier_name: pickFirst(parsedShipment?.carrier_name, item.carrier_name),
      assigned_carrier: pickFirst(parsedShipment?.assigned_carrier, item.assigned_carrier),
      dispatch_date: pickFirst(parsedShipment?.dispatch_date, item.dispatch_date),
      delivery_date: pickFirst(parsedShipment?.delivery_date, item.delivery_date),
    };

    if (!shipment.product_name) {
      shipment.product_name =
        pickFirst(item.product_name, shipment.sku, shipment.tracking_number, "Etiqueta sin producto") ||
        "Etiqueta sin producto";
    }

    if ((shipment.shipping_method || "").toLowerCase() === "flex" && shipment.partido && !shipment.assigned_carrier) {
      try {
        shipment.assigned_carrier = await assignCarrier(shipment.partido);
      } catch {
        shipment.assigned_carrier = null;
      }
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
        asDbValue(shipment.sale_type),
        asDbValue(shipment.sale_id),
        asDbValue(shipment.tracking_number),
        asDbValue(shipment.remitente_id),
        asDbValue(shipment.product_name),
        asDbValue(shipment.sku),
        asDbValue(shipment.color),
        asDbValue(shipment.voltage),
        asDbValue(shipment.quantity),
        asDbValue(shipment.recipient_name),
        asDbValue(shipment.recipient_user),
        asDbValue(shipment.address),
        asDbValue(shipment.postal_code),
        asDbValue(shipment.city),
        asDbValue(shipment.partido),
        asDbValue(shipment.province),
        asDbValue(shipment.reference),
        asDbValue(shipment.shipping_method),
        asDbValue(shipment.carrier_code),
        asDbValue(shipment.carrier_name),
        asDbValue(shipment.assigned_carrier),
        asDbValue(shipment.dispatch_date),
        asDbValue(shipment.delivery_date),
      ],
    });

    inserted += 1;
    if (shipment.tracking_number) {
      existing.add(shipment.tracking_number);
    }
  }

  await db.execute({
    sql: "UPDATE daily_batches SET total_packages = (SELECT COUNT(*) FROM shipments WHERE batch_id = ?) WHERE id = ?",
    args: [asDbValue(batchId), asDbValue(batchId)],
  });

  return { inserted, skipped, recovered_from_reprint: recoveredFromReprint };
}

function parseJsonOrFallback(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function backfillExistingJobToLegacy(jobId) {
  const headerResult = await db.execute({
    sql: `SELECT id, created_at_client, source_files_json
          FROM print_jobs
          WHERE job_id = ?
          LIMIT 1`,
    args: [asDbValue(jobId)],
  });

  if (!headerResult.rows.length) {
    return { found: false, batchId: null, inserted: 0, skipped: 0 };
  }

  const header = headerResult.rows[0];
  const sourceFiles = parseJsonOrFallback(header.source_files_json, []);
  const batchDate = extractDateOnly(header.created_at_client);
  const batchId = await getOrCreateBatch(sourceFiles, batchDate);

  const itemsResult = await db.execute({
    sql: `SELECT
      item_order,
      sku,
      tracking_number,
      raw_block,
      sale_id,
      product_name,
      shipping_method,
      is_reprint
    FROM print_job_items
    WHERE print_job_id = ?
    ORDER BY item_order ASC, id ASC`,
    args: [asDbValue(Number(header.id))],
  });

  const items = itemsResult.rows.map((row) => ({
    item_order: intOrDefault(row.item_order, 0),
    sku: stringOrNull(row.sku, 120) || "SIN-SKU",
    tracking_number: stringOrNull(row.tracking_number, 120),
    raw_block: stringOrNull(row.raw_block, 40000),
    label_fingerprint: null,
    sale_type: null,
    sale_id: stringOrNull(row.sale_id, 120),
    product_name: stringOrNull(row.product_name, 500),
    quantity: 1,
    shipping_method: stringOrNull(row.shipping_method, 50),
    is_reprint: Number(row.is_reprint) === 1 ? 1 : 0,
  }));

  const legacyResult = await insertLegacyShipments(batchId, items);
  return {
    found: true,
    batchId,
    inserted: legacyResult.inserted,
    skipped: legacyResult.skipped,
    recovered_from_reprint: legacyResult.recovered_from_reprint || 0,
  };
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

    if (payload?.is_dry_run === true) {
      return NextResponse.json({ ok: true, ignored: true, reason: "dry_run" });
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

    const contractValidation = validateIntakeContract(payload, rawLabels);
    if (!contractValidation.ok) {
      return NextResponse.json({ error: contractValidation.error }, { status: contractValidation.status });
    }

    const existingJob = await db.execute({
      sql: "SELECT id FROM print_jobs WHERE job_id = ?",
      args: [jobId],
    });
    if (existingJob.rows.length > 0) {
      const backfill = await backfillExistingJobToLegacy(jobId);
      return NextResponse.json({
        ok: true,
        duplicate: true,
        job_id: jobId,
        print_job_id: Number(existingJob.rows[0].id),
        batch_id: backfill.batchId,
        shipments_inserted: backfill.inserted,
        shipments_skipped: backfill.skipped,
        shipments_recovered_from_reprint: backfill.recovered_from_reprint || 0,
      });
    }

    const labels = rawLabels.map((raw, index) => ({
      item_order: Math.max(1, intOrDefault(raw?.order, index + 1)),
      sku: stringOrNull(raw?.sku, 120) || "SIN-SKU",
      tracking_number: stringOrNull(raw?.tracking_number, 120),
      label_fingerprint: stringOrNull(raw?.label_fingerprint, 128),
      raw_block: stringOrNull(raw?.raw_block, 40000),
      sale_type: stringOrNull(raw?.sale_type, 50),
      sale_id: stringOrNull(raw?.sale_id, 120),
      product_name: stringOrNull(raw?.product_name, 500),
      quantity: Math.max(1, intOrDefault(raw?.quantity, 1)),
      remitente_id: stringOrNull(raw?.remitente_id, 120),
      color: stringOrNull(raw?.color, 120),
      voltage: stringOrNull(raw?.voltage, 120),
      recipient_name: stringOrNull(raw?.recipient_name, 200),
      recipient_user: stringOrNull(raw?.recipient_user, 120),
      address: stringOrNull(raw?.address, 500),
      postal_code: stringOrNull(raw?.postal_code, 40),
      city: stringOrNull(raw?.city, 160),
      partido: stringOrNull(raw?.partido, 120),
      province: stringOrNull(raw?.province, 120),
      reference: stringOrNull(raw?.reference, 300),
      shipping_method: stringOrNull(raw?.shipping_method, 50),
      carrier_code: stringOrNull(raw?.carrier_code, 80),
      carrier_name: stringOrNull(raw?.carrier_name, 120),
      assigned_carrier: stringOrNull(raw?.assigned_carrier, 120),
      dispatch_date: stringOrNull(raw?.dispatch_date, 120),
      delivery_date: stringOrNull(raw?.delivery_date, 120),
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
      let isReprint = false;

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

    const batchDate = extractDateOnly(payload?.created_at);
    const batchId = await getOrCreateBatch(sourceFiles, batchDate);
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
          sale_id, product_name, shipping_method, raw_block, is_reprint
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          asDbValue(printJobId),
          asDbValue(item.item_order),
          asDbValue(item.sku),
          asDbValue(item.tracking_number),
          asDbValue(item.label_fingerprint),
          asDbValue(item.sale_id),
          asDbValue(item.product_name),
          asDbValue(item.shipping_method),
          asDbValue(item.raw_block),
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
      shipments_recovered_from_reprint: legacyResult.recovered_from_reprint || 0,
      integrity_verified: true,
      parser_misses: contractValidation.integrity.parser_misses,
    });
  } catch (error) {
    console.error("V2 intake error:", error);
    return NextResponse.json({ error: "Failed to ingest print job" }, { status: 500 });
  }
}
