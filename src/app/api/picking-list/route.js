import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDateRange } from '@/lib/dateUtils';
import { ensureDb } from '@/lib/ensureDb';

export async function GET(request) {
    try {
        await ensureDb();
        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period');
        const specificDate = searchParams.get('date');
        const batch_id = searchParams.get('batch_id');

        let sql, args = [];

        if (batch_id) {
            sql = "SELECT * FROM shipments WHERE batch_id = ?";
            args.push(batch_id);
        } else if (period) {
            const range = getDateRange(period, specificDate);
            sql = `SELECT s.* FROM shipments s
             JOIN daily_batches b ON s.batch_id = b.id
             WHERE b.date >= ? AND b.date <= ?`;
            args.push(range.from, range.to);
        } else {
            sql = "SELECT * FROM shipments";
        }

        const result = await db.execute({ sql, args });
        const shipments = result.rows;

        // Group by product_name + sku + shipping_method
        const products = {};

        for (const s of shipments) {
            const skuStr = s.sku || 'N/A';
            const methodStr = s.shipping_method || 'colecta';
            const key = `${s.product_name}|${skuStr}|${methodStr}`;

            if (!products[key]) {
                products[key] = {
                    product_name: s.product_name,
                    sku: s.sku,
                    color: s.color,
                    shipping_method: methodStr,
                    total_quantity: 0,
                    shipment_count: 0,
                    shipment_ids: [],
                    statuses: [],
                };
            }

            products[key].total_quantity += Number(s.quantity) || 1;
            products[key].shipment_count += 1;
            products[key].shipment_ids.push(s.id);
            products[key].statuses.push(s.status);
        }

        return NextResponse.json(Object.values(products));
    } catch (error) {
        console.error("Picking list error:", error);
        return NextResponse.json({ error: "Failed to load picking list" }, { status: 500 });
    }
}
