import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/ensureDb";

function parseJsonOrFallback(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export async function GET(request, context) {
  try {
    await ensureDb();
    const { jobId } = await context.params;

    const headerResult = await db.execute({
      sql: `SELECT
          id,
          job_id,
          created_at_client,
          received_at,
          source_files_json,
          sku_order_json,
          printer_path,
          print_file_path,
          labels_total,
          skus_total,
          reprints_total
        FROM print_jobs
        WHERE job_id = ?
        LIMIT 1`,
      args: [jobId],
    });

    if (!headerResult.rows.length) {
      return NextResponse.json({ error: "Print job not found" }, { status: 404 });
    }

    const header = headerResult.rows[0];
    const itemsResult = await db.execute({
      sql: `SELECT
          item_order,
          sku,
          tracking_number,
          label_fingerprint,
          sale_id,
          product_name,
          shipping_method,
          is_reprint
        FROM print_job_items
        WHERE print_job_id = ?
        ORDER BY item_order ASC, id ASC`,
      args: [Number(header.id)],
    });

    return NextResponse.json({
      job: {
        id: Number(header.id),
        job_id: header.job_id,
        created_at_client: header.created_at_client,
        received_at: header.received_at,
        source_files: parseJsonOrFallback(header.source_files_json, []),
        sku_order: parseJsonOrFallback(header.sku_order_json, []),
        printer_path: header.printer_path,
        print_file_path: header.print_file_path,
        labels_total: Number(header.labels_total) || 0,
        skus_total: Number(header.skus_total) || 0,
        reprints_total: Number(header.reprints_total) || 0,
      },
      items: itemsResult.rows.map((row) => ({
        item_order: Number(row.item_order) || 0,
        sku: row.sku,
        tracking_number: row.tracking_number,
        label_fingerprint: row.label_fingerprint,
        sale_id: row.sale_id,
        product_name: row.product_name,
        shipping_method: row.shipping_method,
        is_reprint: Number(row.is_reprint) === 1,
      })),
    });
  } catch (error) {
    console.error("V2 print-job detail error:", error);
    return NextResponse.json({ error: "Failed to load print job detail" }, { status: 500 });
  }
}
