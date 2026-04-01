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
        const period = searchParams.get('period');
        const specificDate = searchParams.get('date');
        const batch_id = searchParams.get('batch_id');
        const status = searchParams.get('status');
        const shipping_method = searchParams.get('shipping_method');
        const carrier = searchParams.get('carrier');

        let sql, args = [];
        let orderBy = "id";
        let columnPrefix = "";

        if (batch_id) {
            sql = "SELECT * FROM shipments WHERE workspace_id = ? AND batch_id = ?";
            args.push(workspaceId, batch_id);
        } else if (period) {
            const range = getDateRange(period, specificDate);
            sql = `SELECT s.* FROM shipments s
             JOIN daily_batches b ON s.batch_id = b.id
             WHERE s.workspace_id = ? AND b.workspace_id = ? AND b.date >= ? AND b.date <= ?`;
            args.push(workspaceId, workspaceId, range.from, range.to);
            orderBy = "s.id";
            columnPrefix = "s.";
        } else {
            sql = "SELECT * FROM shipments WHERE workspace_id = ?";
            args.push(workspaceId);
        }

        if (status) {
            sql += ` AND ${columnPrefix}status = ?`;
            args.push(status);
        }
        if (shipping_method) {
            sql += ` AND ${columnPrefix}shipping_method = ?`;
            args.push(shipping_method);
        }
        if (carrier) {
            sql += ` AND ${columnPrefix}assigned_carrier = ?`;
            args.push(carrier);
        }

        sql += ` ORDER BY ${orderBy} DESC`;

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
        const authResult = await requireWorkspaceActor(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }
        const workspaceId = authResult.actor.workspaceId;
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
                sql: "UPDATE shipments SET status = ? WHERE id = ? AND workspace_id = ?",
                args: [status, id, workspaceId]
            });
        }

        if (assigned_carrier !== null) {
            await db.execute({
                sql: "UPDATE shipments SET assigned_carrier = ? WHERE id = ? AND workspace_id = ?",
                args: [assigned_carrier || null, id, workspaceId]
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
        const authResult = await requireWorkspaceActor(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }
        const workspaceId = authResult.actor.workspaceId;
        const { searchParams } = new URL(request.url);
        const batch_id = searchParams.get('batch_id');
        const period = searchParams.get('period');
        const specificDate = searchParams.get('date');

        if (batch_id) {
            await db.execute({ sql: "DELETE FROM shipments WHERE workspace_id = ? AND batch_id = ?", args: [workspaceId, batch_id] });
        } else if (period) {
            const range = getDateRange(period, specificDate);
            await db.execute({
                sql: `DELETE FROM shipments WHERE batch_id IN (
                    SELECT id FROM daily_batches WHERE workspace_id = ? AND date >= ? AND date <= ?
                )`,
                args: [workspaceId, range.from, range.to]
            });
        } else {
            await db.execute({ sql: "DELETE FROM shipments WHERE workspace_id = ?", args: [workspaceId] });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error clearing shipments:", error);
        return NextResponse.json({ error: "Failed to clear shipments" }, { status: 500 });
    }
}
