import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getArgentinaDateString, getDateRange } from '@/lib/dateUtils';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';

function getComparisonRange(period) {
    const now = new Date();
    const fmt = getArgentinaDateString;

    if (period === 'today') {
        const prev = new Date(now);
        prev.setDate(now.getDate() - 1);
        return { from: fmt(prev), to: fmt(prev) };
    }

    if (period === 'week') {
        const day = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
        const prevMonday = new Date(monday);
        prevMonday.setDate(monday.getDate() - 7);
        const prevSunday = new Date(monday);
        prevSunday.setDate(monday.getDate() - 1);
        return { from: fmt(prevMonday), to: fmt(prevSunday) };
    }

    if (period === 'month') {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthEnd = new Date(firstDay);
        prevMonthEnd.setDate(0);
        return { from: fmt(prevMonthStart), to: fmt(prevMonthEnd) };
    }

    return null;
}

function summarizeShipments(shipments, period) {
    const total_packages = shipments.reduce((total, s) => total + Number(s.package_count), 0);
    let total_units = 0;
    const by_status = {};
    const by_method = {};
    const by_carrier = {};
    const by_province = {};
    const by_day = {};

    for (const s of shipments) {
        const count = Number(s.package_count);
        total_units += Number(s.unit_count);
        by_status[s.status] = (by_status[s.status] || 0) + count;
        const method = s.shipping_method || "desconocido";
        by_method[method] = (by_method[method] || 0) + count;
        if (s.shipping_method === 'flex') {
            const carrier = s.assigned_carrier || "Sin asignar (Flex)";
            by_carrier[carrier] = (by_carrier[carrier] || 0) + count;
        }
        const prov = s.province || "Desconocida";
        by_province[prov] = (by_province[prov] || 0) + count;

        if (period === 'range' && s.batch_date) {
            if (!by_day[s.batch_date]) {
                by_day[s.batch_date] = { date: s.batch_date, total: 0, colecta: 0, flex: 0, zipnova: 0 };
            }
            by_day[s.batch_date].total += count;
            if (method === 'colecta') by_day[s.batch_date].colecta += count;
            if (method === 'flex') by_day[s.batch_date].flex += count;
            if (method === 'zipnova') by_day[s.batch_date].zipnova += count;
        }
    }

    let daily_rankings = null;
    if (period === 'range') {
        const days = Object.values(by_day);
        const limit = Math.min(days.length, 5);
        const top_days = [...days]
            .sort((a, b) => (b.total - a.total) || String(a.date).localeCompare(String(b.date)))
            .slice(0, limit);
        const low_days = [...days]
            .sort((a, b) => (a.total - b.total) || String(a.date).localeCompare(String(b.date)))
            .slice(0, limit);

        daily_rankings = { limit, top_days, low_days };
    }

    return { total_packages, total_units, by_status, by_method, by_carrier, by_province, daily_rankings };
}

async function buildSummary(workspaceId, actor, range, period, batchId = null) {
    let sql;
    let args;

    // Aggregate in SQLite so historical periods do not transfer one row per shipment.
    const dateField = period === 'range' && !batchId ? 'b.date' : 'NULL';
    const fields = `s.status, s.shipping_method, s.assigned_carrier, s.province, ${dateField} AS batch_date,
        COUNT(*) AS package_count, SUM(CASE WHEN CAST(s.quantity AS NUMERIC) = 0 OR s.quantity IS NULL THEN 1 ELSE CAST(s.quantity AS NUMERIC) END) AS unit_count`;
    if (batchId) {
        sql = `SELECT ${fields} FROM shipments s WHERE s.workspace_id = ? AND s.batch_id = ?
            GROUP BY s.status, s.shipping_method, s.assigned_carrier, s.province`;
        args = [workspaceId, batchId];
    } else {
        const dateGroup = period === 'range' ? ', b.date' : '';
        sql = `SELECT ${fields} FROM shipments s
             JOIN daily_batches b ON s.batch_id = b.id
             WHERE s.workspace_id = ? AND b.workspace_id = ? AND b.date >= ? AND b.date <= ?
             GROUP BY s.status, s.shipping_method, s.assigned_carrier, s.province${dateGroup}`;
        args = [workspaceId, workspaceId, range.from, range.to];
    }

    const result = await db.execute({ sql, args });
    const shipments = result.rows;
    return summarizeShipments(shipments, period);
}

export async function GET(request) {
    try {
        await ensureDb();
        const authResult = await requireWorkspaceActor(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }
        const workspaceId = authResult.actor.workspaceId;
        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || 'today';
        const specificDate = searchParams.get('date');
        const fromDate = searchParams.get('from');
        const toDate = searchParams.get('to');
        const batch_id = searchParams.get('batch_id');
        const range = getDateRange(period, specificDate, fromDate, toDate);
        const comparisonRange = getComparisonRange(period);
        // Período actual y de comparación en paralelo: cada consulta paga la latencia de la base.
        const [summary, previous] = await Promise.all([
            buildSummary(workspaceId, authResult.actor, range, period, batch_id),
            !batch_id && comparisonRange
                ? buildSummary(workspaceId, authResult.actor, comparisonRange, period)
                : null,
        ]);

        let comparison = null;
        if (previous) {
            const pct = (current, prev) => {
                if (!prev) return current > 0 ? 100 : 0;
                return Number((((current - prev) / prev) * 100).toFixed(1));
            };

            comparison = {
                previous,
                delta: {
                    total_packages: pct(summary.total_packages, previous.total_packages),
                    total_units: pct(summary.total_units, previous.total_units),
                    flex: pct(summary.by_method.flex || 0, previous.by_method.flex || 0),
                    colecta: pct(summary.by_method.colecta || 0, previous.by_method.colecta || 0),
                    zipnova: pct(summary.by_method.zipnova || 0, previous.by_method.zipnova || 0),
                },
            };
        }

        return NextResponse.json({
            ...summary,
            comparison,
        });
    } catch (error) {
        console.error("Dashboard error:", error);
        return NextResponse.json({ error: "Failed to load dashboard data" }, { status: 500 });
    }
}
