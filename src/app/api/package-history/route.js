import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/ensureDb";
import { requireWorkspaceActor } from "@/lib/auth";
import {
  buildExactMatchRankSql,
  buildPackageHistoryFilters,
  decodePackageHistoryCursor,
  encodePackageHistoryCursor,
  exactMatchRankArgs,
  getPackageHistoryLimit,
  packageHistorySummaryFromRow,
} from "@/lib/packageHistory";

const SUMMARY_COLUMNS = `
  s.id, s.product_name, s.sku, s.tracking_number, s.sale_id,
  s.external_order_id, s.external_shipment_id, s.status, s.dispatch_date, s.created_at,
  COALESCE(NULLIF(TRIM(s.assigned_carrier), ''), NULLIF(TRIM(s.carrier_name), ''), 'Sin asignar') AS carrier`;

export async function GET(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) return NextResponse.json(authResult.error.body, { status: authResult.error.status });

    const { searchParams } = new URL(request.url);
    const filters = buildPackageHistoryFilters({
      workspaceId: authResult.actor.workspaceId,
      query: searchParams.get("q"),
    });
    const limit = getPackageHistoryLimit(searchParams.get("limit"));
    const cursor = decodePackageHistoryCursor(searchParams.get("before"));
    const rankSql = buildExactMatchRankSql(filters.normalizedQuery);
    const rankArgs = exactMatchRankArgs(filters.normalizedQuery);
    const cursorSql = cursor ? "WHERE match_rank > ? OR (match_rank = ? AND id < ?)" : "";
    const cursorArgs = cursor ? [cursor.rank, cursor.rank, cursor.id] : [];

    const [itemsResult, countResult] = await Promise.all([
      db.execute({
        sql: `WITH matched AS (
          SELECT ${SUMMARY_COLUMNS}, ${rankSql} AS match_rank
          FROM shipments s
          WHERE ${filters.whereSql}
        )
        SELECT * FROM matched
        ${cursorSql}
        ORDER BY match_rank ASC, id DESC
        LIMIT ?`,
        args: [...rankArgs, ...filters.args, ...cursorArgs, limit + 1],
      }),
      db.execute({
        sql: `SELECT COUNT(*) AS total FROM shipments s WHERE ${filters.whereSql}`,
        args: filters.args,
      }),
    ]);

    const rows = itemsResult.rows || [];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const lastRow = pageRows.at(-1);

    return NextResponse.json({
      query: filters.normalizedQuery,
      total: Number(countResult.rows[0]?.total) || 0,
      items: pageRows.map(packageHistorySummaryFromRow),
      next_before: hasMore && lastRow ? encodePackageHistoryCursor({ rank: lastRow.match_rank, id: lastRow.id }) : null,
    });
  } catch (error) {
    console.error("Package history GET error:", error);
    return NextResponse.json({ error: "No se pudo cargar el historial de paquetes" }, { status: 500 });
  }
}
