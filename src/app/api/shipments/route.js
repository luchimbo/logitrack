import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDateRange } from '@/lib/dateUtils';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period');
        const specificDate = searchParams.get('date');
        const batch_id = searchParams.get('batch_id');
        const status = searchParams.get('status');
        const shipping_method = searchParams.get('shipping_method');
        const carrier = searchParams.get('carrier');

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
            sql = "SELECT * FROM shipments WHERE 1=1";
        }

        if (status) {
            sql += " AND s.status = ?";
            args.push(status);
        }
        if (shipping_method) {
            sql += " AND s.shipping_method = ?";
            args.push(shipping_method);
        }
        if (carrier) {
            sql += " AND s.assigned_carrier = ?";
            args.push(carrier);
        }

        sql += " ORDER BY s.id DESC";

        const result = await db.execute({ sql, args });
        return NextResponse.json(result.rows);
    } catch (error) {
        console.error("Error fetching shipments:", error);
        return NextResponse.json({ error: "Failed to fetch shipments" }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const status = searchParams.get('status');

        if (!id || !status) {
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
        }

        const validStatuses = ["pendiente", "encontrado", "empaquetado", "despachado"];
        if (!validStatuses.includes(status)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }

        await db.execute({
            sql: "UPDATE shipments SET status = ? WHERE id = ?",
            args: [status, id]
        });

        return NextResponse.json({ success: true, id, status });
    } catch (error) {
        console.error("Error updating shipment:", error);
        return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const { searchParams } = new URL(request.url);
        const batch_id = searchParams.get('batch_id');

        let sql = "DELETE FROM shipments";
        const args = [];

        if (batch_id) {
            sql += " WHERE batch_id = ?";
            args.push(batch_id);
        }

        await db.execute({ sql, args });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error clearing shipments:", error);
        return NextResponse.json({ error: "Failed to clear shipments" }, { status: 500 });
    }
}
