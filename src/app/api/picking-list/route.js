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
