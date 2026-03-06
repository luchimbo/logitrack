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
        await ensureDb();
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const status = searchParams.get('status');
        const assigned_carrier = searchParams.get('assigned_carrier');

        if (!id) {
            return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
        }

        if (status) {
            const validStatuses = ["pendiente", "encontrado", "empaquetado", "despachado"];
            if (!validStatuses.includes(status)) {
                return NextResponse.json({ error: "Invalid status" }, { status: 400 });
            }
            await db.execute({
                sql: "UPDATE shipments SET status = ? WHERE id = ?",
                args: [status, id]
            });
        }

        if (assigned_carrier !== null) {
            await db.execute({
                sql: "UPDATE shipments SET assigned_carrier = ? WHERE id = ?",
                args: [assigned_carrier || null, id]
            });
        }

        return NextResponse.json({ success: true, id, status, assigned_carrier });
    } catch (error) {
        console.error("Error updating shipment:", error);
        return NextResponse.json({ error: "Failed to update shipment" }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        await ensureDb();
        const { searchParams } = new URL(request.url);
        const batch_id = searchParams.get('batch_id');
        const period = searchParams.get('period');
        const specificDate = searchParams.get('date');

        if (batch_id) {
            await db.execute({ sql: "DELETE FROM shipments WHERE batch_id = ?", args: [batch_id] });
        } else if (period) {
            const range = getDateRange(period, specificDate);
            await db.execute({
                sql: `DELETE FROM shipments WHERE batch_id IN (
                    SELECT id FROM daily_batches WHERE date >= ? AND date <= ?
                )`,
                args: [range.from, range.to]
            });
        } else {
            await db.execute("DELETE FROM shipments");
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error clearing shipments:", error);
        return NextResponse.json({ error: "Failed to clear shipments" }, { status: 500 });
    }
}
