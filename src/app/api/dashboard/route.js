import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const batch_id = searchParams.get('batch_id');

        let sql = "SELECT * FROM shipments";
        const args = [];

        if (batch_id) {
            sql += " WHERE batch_id = ?";
            args.push(batch_id);
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

            // Status
            by_status[s.status] = (by_status[s.status] || 0) + 1;

            // Method
            const method = s.shipping_method || "desconocido";
            by_method[method] = (by_method[method] || 0) + 1;

            // Carrier
            const carrier = s.assigned_carrier || s.carrier_name || "Sin asignar";
            by_carrier[carrier] = (by_carrier[carrier] || 0) + 1;

            // Province
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
