import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/ensureDb";
import { parseZplFile } from "@/lib/zplParser";
import { assignCarrier } from "@/lib/zoneMapper";

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

function intOrDefault(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function extractDateOnly(value) {
  const s = stringOrNull(value, 60);
  if (!s) return null;
  const datePart = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  return null;
}

function parseJsonOrFallback(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
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

function rebuildRawZpl(rawBlock) {
  const block = stringOrNull(rawBlock, 40000);
  if (!block) return null;

  const clean = block.trim();
  const hasStart = clean.startsWith("^XA");
  const hasEnd = clean.endsWith("^XZ");

  if (hasStart && hasEnd) return clean;
  if (hasStart) return `${clean}^XZ`;
  if (hasEnd) return `^XA${clean}`;
  return `^XA${clean}^XZ`;
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

async function getExistingShipments(trackings) {
  const map = new Map();
  const list = [...new Set(trackings.filter(Boolean))];
  if (!list.length) return map;

  const CHUNK = 300;
  for (let i = 0; i < list.length; i += CHUNK) {
    const chunk = list.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => "?").join(", ");
    const result = await db.execute({
      sql: `SELECT id, tracking_number, raw_zpl FROM shipments WHERE tracking_number IN (${placeholders})`,
      args: chunk,
    });
    for (const row of result.rows) {
      const tracking = stringOrNull(row.tracking_number, 120);
      if (tracking) {
        map.set(tracking, { id: Number(row.id), raw_zpl: stringOrNull(row.raw_zpl, 40000) });
      }
    }
  }

  return map;
}

async function recoverJob(jobId) {
  const headerResult = await db.execute({
    sql: `SELECT id, job_id, created_at_client, source_files_json
          FROM print_jobs
          WHERE job_id = ?
          LIMIT 1`,
    args: [asDbValue(jobId)],
  });

  if (!headerResult.rows.length) {
    return { job_id: jobId, found: false, inserted: 0, skipped: 0, batch_id: null };
  }

  const header = headerResult.rows[0];
  const sourceFiles = parseJsonOrFallback(header.source_files_json, []);
  const batchId = await getOrCreateBatch(sourceFiles, extractDateOnly(header.created_at_client));

  const itemsResult = await db.execute({
    sql: `SELECT
      item_order,
      sku,
      tracking_number,
      sale_id,
      product_name,
      shipping_method,
      raw_block
    FROM print_job_items
    WHERE print_job_id = ?
    ORDER BY item_order ASC, id ASC`,
    args: [asDbValue(Number(header.id))],
  });

  const items = itemsResult.rows || [];
  const existingShipments = await getExistingShipments(items.map((x) => stringOrNull(x.tracking_number, 120)));

  let inserted = 0;
  let skipped = 0;
  let rawZplBackfilled = 0;

  for (const item of items) {
    const tracking = stringOrNull(item.tracking_number, 120);
    const existing = tracking ? existingShipments.get(tracking) : null;

    const parsed = parseShipmentFromRawBlock(item.raw_block);
    const rawZpl = stringOrNull(parsed?.raw_zpl, 40000) || rebuildRawZpl(item.raw_block);

    if (existing) {
      if (!existing.raw_zpl && rawZpl) {
        await db.execute({
          sql: "UPDATE shipments SET raw_zpl = ? WHERE id = ?",
          args: [asDbValue(rawZpl), asDbValue(existing.id)],
        });
        rawZplBackfilled += 1;
      }
      skipped += 1;
      continue;
    }

    const shipment = {
      sale_type: pickFirst(parsed?.sale_type, null),
      sale_id: pickFirst(parsed?.sale_id, stringOrNull(item.sale_id, 120)),
      tracking_number: pickFirst(parsed?.tracking_number, tracking),
      remitente_id: pickFirst(parsed?.remitente_id, null),
      product_name: pickFirst(parsed?.product_name, stringOrNull(item.product_name, 500)),
      sku: pickFirst(parsed?.sku, stringOrNull(item.sku, 120)),
      color: pickFirst(parsed?.color, null),
      voltage: pickFirst(parsed?.voltage, null),
      quantity: Math.max(1, intOrDefault(pickFirst(parsed?.quantity, 1), 1)),
      recipient_name: pickFirst(parsed?.recipient_name, null),
      recipient_user: pickFirst(parsed?.recipient_user, null),
      address: pickFirst(parsed?.address, null),
      postal_code: pickFirst(parsed?.postal_code, null),
      city: pickFirst(parsed?.city, null),
      partido: pickFirst(parsed?.partido, null),
      province: pickFirst(parsed?.province, null),
      reference: pickFirst(parsed?.reference, null),
      shipping_method: pickFirst(parsed?.shipping_method, stringOrNull(item.shipping_method, 50)),
      carrier_code: pickFirst(parsed?.carrier_code, null),
      carrier_name: pickFirst(parsed?.carrier_name, null),
      assigned_carrier: pickFirst(parsed?.assigned_carrier, null),
      dispatch_date: pickFirst(parsed?.dispatch_date, null),
      delivery_date: pickFirst(parsed?.delivery_date, null),
    };

    if (!shipment.product_name) {
      shipment.product_name = pickFirst(shipment.sku, shipment.tracking_number, "Etiqueta sin producto") || "Etiqueta sin producto";
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
        dispatch_date, delivery_date, status, raw_zpl
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, 'pendiente', ?
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
        asDbValue(rawZpl),
      ],
    });

    inserted += 1;
    if (shipment.tracking_number) {
      existingShipments.set(shipment.tracking_number, { id: NaN, raw_zpl: rawZpl });
    }
  }

  await db.execute({
    sql: "UPDATE daily_batches SET total_packages = (SELECT COUNT(*) FROM shipments WHERE batch_id = ?) WHERE id = ?",
    args: [asDbValue(batchId), asDbValue(batchId)],
  });

  return {
    job_id: header.job_id,
    found: true,
    batch_id: batchId,
    total_items: items.length,
    inserted,
    skipped,
    raw_zpl_backfilled: rawZplBackfilled,
  };
}

export async function POST(request) {
  try {
    await ensureDb();

    const requiredToken = process.env.PRINT_AGENT_TOKEN;
    if (requiredToken) {
      const providedToken = request.headers.get("x-print-agent-token");
      if (!providedToken || providedToken !== requiredToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await request.json().catch(() => ({}));
    const single = stringOrNull(body?.job_id, 120);
    const many = Array.isArray(body?.job_ids)
      ? body.job_ids.map((x) => stringOrNull(x, 120)).filter(Boolean)
      : [];
    const recentLimit = Math.max(1, Math.min(100, intOrDefault(body?.recent_limit, 30)));
    let jobIds = [...new Set([single, ...many].filter(Boolean))];

    if (!jobIds.length) {
      const recentJobs = await db.execute({
        sql: "SELECT job_id FROM print_jobs ORDER BY id DESC LIMIT ?",
        args: [asDbValue(recentLimit)],
      });
      jobIds = recentJobs.rows.map((r) => stringOrNull(r.job_id, 120)).filter(Boolean);
    }

    if (!jobIds.length) {
      return NextResponse.json({ error: "No print jobs found to recover" }, { status: 404 });
    }

    const results = [];
    let insertedTotal = 0;
    let skippedTotal = 0;
    let rawZplBackfilledTotal = 0;

    for (const jobId of jobIds) {
      const result = await recoverJob(jobId);
      results.push(result);
      insertedTotal += result.inserted || 0;
      skippedTotal += result.skipped || 0;
      rawZplBackfilledTotal += result.raw_zpl_backfilled || 0;
    }

    return NextResponse.json({
      ok: true,
      jobs_requested: jobIds.length,
      inserted_total: insertedTotal,
      skipped_total: skippedTotal,
      raw_zpl_backfilled_total: rawZplBackfilledTotal,
      results,
    });
  } catch (error) {
    console.error("V2 recover error:", error);
    return NextResponse.json({ error: "Failed to recover print jobs into shipments" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST with job_id/job_ids" }, { status: 405 });
}
