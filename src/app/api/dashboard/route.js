import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDateRange } from '@/lib/dateUtils';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';

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

        let sql, args;

        if (batch_id) {
            // Legacy: filter by specific batch
            sql = "SELECT *, NULL AS batch_date FROM shipments WHERE workspace_id = ? AND batch_id = ?";
            args = [workspaceId, batch_id];
        } else {
            // New: filter by period via daily_batches.date
            const range = getDateRange(period, specificDate, fromDate, toDate);
            sql = `SELECT s.*, b.date AS batch_date FROM shipments s
             JOIN daily_batches b ON s.batch_id = b.id
             WHERE s.workspace_id = ? AND b.workspace_id = ? AND b.date >= ? AND b.date <= ?`;
            args = [workspaceId, workspaceId, range.from, range.to];
        }

        const result = await db.execute({ sql, args });
        const shipments = result.rows;

        if (!shipments || shipments.length === 0) {
            return NextResponse.json({
                total_packages: 0,
                total_units: 0,
                by_status: {},
                by_method: {},
                by_carrier: {},
                by_province: {},
            });
        }

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
                    by_day[s.batch_date] = { date: s.batch_date, total: 0, colecta: 0, flex: 0 };
                }
                by_day[s.batch_date].total += 1;
                if (method === 'colecta') by_day[s.batch_date].colecta += 1;
                if (method === 'flex') by_day[s.batch_date].flex += 1;
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

            daily_rankings = {
                limit,
                top_days,
                low_days,
            };
        }

        return NextResponse.json({
            total_packages,
            total_units,
            by_status,
            by_method,
            by_carrier,
            by_province,
            daily_rankings,
        });
    } catch (error) {
        console.error("Dashboard error:", error);
        return NextResponse.json({ error: "Failed to load dashboard data" }, { status: 500 });
    }
}
