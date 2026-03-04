import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDateRange } from '@/lib/dateUtils';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || 'today';
        const specificDate = searchParams.get('date');
        const batch_id = searchParams.get('batch_id');

        let sql, args;

        if (batch_id) {
            // Legacy: filter by specific batch
            sql = "SELECT * FROM shipments WHERE batch_id = ?";
            args = [batch_id];
        } else {
            // New: filter by period via daily_batches.date
            const range = getDateRange(period, specificDate);
            sql = `SELECT s.* FROM shipments s
             JOIN daily_batches b ON s.batch_id = b.id
             WHERE b.date >= ? AND b.date <= ?`;
            args = [range.from, range.to];
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

        for (const s of shipments) {
            total_units += Number(s.quantity) || 1;
            by_status[s.status] = (by_status[s.status] || 0) + 1;
            const method = s.shipping_method || "desconocido";
            by_method[method] = (by_method[method] || 0) + 1;
            const carrier = s.assigned_carrier || s.carrier_name || "Sin asignar";
            by_carrier[carrier] = (by_carrier[carrier] || 0) + 1;
            const prov = s.province || "Desconocida";
            by_province[prov] = (by_province[prov] || 0) + 1;
        }

        return NextResponse.json({
            total_packages,
            total_units,
            by_status,
            by_method,
            by_carrier,
            by_province,
        });
    } catch (error) {
        console.error("Dashboard error:", error);
        return NextResponse.json({ error: "Failed to load dashboard data" }, { status: 500 });
    }
}
