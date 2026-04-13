import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDateRange } from '@/lib/dateUtils';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';
import { fetchStoredZipnovaDashboardRows } from '@/lib/zipnovaStore';

function getComparisonRange(period) {
    const now = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);

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
    const total_packages = shipments.length;
    let total_units = 0;
    const by_status = {};
    const by_method = {};
    const by_carrier = {};
    const by_province = {};
    const by_day = {};

    for (const s of shipments) {
        total_units += Number(s.quantity) || 1;
        by_status[s.status] = (by_status[s.status] || 0) + 1;
        const method = s.shipping_method || "desconocido";
        by_method[method] = (by_method[method] || 0) + 1;
        if (s.shipping_method === 'flex') {
            const carrier = s.assigned_carrier || "Sin asignar (Flex)";
            by_carrier[carrier] = (by_carrier[carrier] || 0) + 1;
        }
        const prov = s.province || "Desconocida";
        by_province[prov] = (by_province[prov] || 0) + 1;

        if (period === 'range' && s.batch_date) {
            if (!by_day[s.batch_date]) {
                by_day[s.batch_date] = { date: s.batch_date, total: 0, colecta: 0, flex: 0, zipnova: 0 };
            }
            by_day[s.batch_date].total += 1;
            if (method === 'colecta') by_day[s.batch_date].colecta += 1;
            if (method === 'flex') by_day[s.batch_date].flex += 1;
            if (method === 'zipnova') by_day[s.batch_date].zipnova += 1;
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

    if (batchId) {
        sql = "SELECT *, NULL AS batch_date FROM shipments WHERE workspace_id = ? AND batch_id = ?";
        args = [workspaceId, batchId];
    } else {
        sql = `SELECT s.*, b.date AS batch_date FROM shipments s
             JOIN daily_batches b ON s.batch_id = b.id
             WHERE s.workspace_id = ? AND b.workspace_id = ? AND b.date >= ? AND b.date <= ?`;
        args = [workspaceId, workspaceId, range.from, range.to];
    }

    const result = await db.execute({ sql, args });
    const shipments = result.rows;
    const zipnovaShipments = !batchId && actor.isGlobalAdmin ? await fetchStoredZipnovaDashboardRows(range) : [];
    return summarizeShipments([...shipments, ...zipnovaShipments], period);
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
        const summary = await buildSummary(workspaceId, authResult.actor, range, period, batch_id);

        let comparison = null;
        const comparisonRange = getComparisonRange(period);
        if (!batch_id && comparisonRange) {
            const previous = await buildSummary(workspaceId, authResult.actor, comparisonRange, period);
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
