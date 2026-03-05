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

export async function GET(request) {
  try {
    await ensureDb();

    const { searchParams } = new URL(request.url);
    const requestedLimit = Number(searchParams.get("limit"));
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(200, Math.trunc(requestedLimit)))
      : 50;

    const jobsResult = await db.execute({
      sql: `SELECT
          id,
          job_id,
          created_at_client,
          received_at,
          source_files_json,
          sku_order_json,
          printer_path,
          labels_total,
          skus_total,
          reprints_total
        FROM print_jobs
        ORDER BY id DESC
        LIMIT ?`,
      args: [limit],
    });

    const summaryResult = await db.execute(`SELECT
      COUNT(*) AS total_jobs,
      COALESCE(SUM(labels_total), 0) AS total_labels,
      COALESCE(SUM(reprints_total), 0) AS total_reprints
      FROM print_jobs`);

    const jobs = jobsResult.rows.map((row) => ({
      id: Number(row.id),
      job_id: row.job_id,
      created_at_client: row.created_at_client,
      received_at: row.received_at,
      source_files: parseJsonOrFallback(row.source_files_json, []),
      sku_order: parseJsonOrFallback(row.sku_order_json, []),
      printer_path: row.printer_path,
      labels_total: Number(row.labels_total) || 0,
      skus_total: Number(row.skus_total) || 0,
      reprints_total: Number(row.reprints_total) || 0,
    }));

    const summaryRow = summaryResult.rows[0] || {};

    return NextResponse.json({
      summary: {
        total_jobs: Number(summaryRow.total_jobs) || 0,
        total_labels: Number(summaryRow.total_labels) || 0,
        total_reprints: Number(summaryRow.total_reprints) || 0,
      },
      jobs,
    });
  } catch (error) {
    console.error("V2 print-jobs GET error:", error);
    return NextResponse.json({ error: "Failed to load print jobs" }, { status: 500 });
  }
}
