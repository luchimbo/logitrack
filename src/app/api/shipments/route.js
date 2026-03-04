import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const batch_id = searchParams.get('batch_id');
        const status = searchParams.get('status');
        const shipping_method = searchParams.get('shipping_method');
        const carrier = searchParams.get('carrier');

        let sql = "SELECT * FROM shipments WHERE 1=1";
        const args = [];

        if (batch_id) {
            sql += " AND batch_id = ?";
            args.push(batch_id);
        }
        if (status) {
            sql += " AND status = ?";
            args.push(status);
        }
        if (shipping_method) {
            sql += " AND shipping_method = ?";
            args.push(shipping_method);
        }
        if (carrier) {
            sql += " AND assigned_carrier = ?";
            args.push(carrier);
        }

        sql += " ORDER BY id DESC";

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
        console.error("Error updating shipment status:", error);
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
        return NextResponse.json({ success: true, deleted: true });
    } catch (error) {
        console.error("Error clearing shipments:", error);
        return NextResponse.json({ error: "Failed to clear shipments" }, { status: 500 });
    }
}
