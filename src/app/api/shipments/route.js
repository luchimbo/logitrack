import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getDateRange } from '@/lib/dateUtils';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';
import { deleteShipmentsByIds } from '@/lib/shipmentDeletion';
import { deriveMercadoLibreLogistics } from '@/lib/mercadolibreLogistics';

function parseJson(value, fallback) {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
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
        const period = searchParams.get('period');
        const specificDate = searchParams.get('date');
        const fromDate = searchParams.get('from');
        const toDate = searchParams.get('to');
        const batch_id = searchParams.get('batch_id');
        const status = searchParams.get('status');
        const shipping_method = searchParams.get('shipping_method');
        const carrier = searchParams.get('carrier');
        const connection_id = searchParams.get('connection_id');

        let sql, args = [];
        let orderBy = "id";
        let columnPrefix = "";

        // ML join helper — agrega estado MELI a shipments de origen mercadolibre
        const mlJoin = `LEFT JOIN mercadolibre_orders mo ON mo.workspace_id = s.workspace_id AND mo.shipment_id = s.external_shipment_id AND s.external_provider = 'mercadolibre'`;
        const mlCols = `, mo.shipment_status AS ml_shipment_status, mo.shipment_substatus AS ml_shipment_substatus,
            mo.logistic_type AS ml_logistic_type, mo.shipping_method AS ml_shipping_method, mo.lead_time_json AS ml_lead_time_json,
            mo.delays_json AS ml_delays_json, mo.carrier_json AS ml_carrier_json, mo.history_json AS ml_history_json,
            mo.label_imported_at AS ml_label_imported_at, mo.shipment_row_id AS ml_shipment_row_id`;

        if (batch_id) {
            sql = `SELECT s.*${mlCols} FROM shipments s ${mlJoin} WHERE s.workspace_id = ? AND s.batch_id = ?`;
            args.push(workspaceId, batch_id);
            columnPrefix = "s.";
        } else if (period) {
            const range = getDateRange(period, specificDate, fromDate, toDate);
            sql = `SELECT s.*${mlCols} FROM shipments s
             ${mlJoin}
             JOIN daily_batches b ON s.batch_id = b.id
             WHERE s.workspace_id = ? AND b.workspace_id = ? AND b.date >= ? AND b.date <= ?`;
            args.push(workspaceId, workspaceId, range.from, range.to);
            orderBy = "s.id";
            columnPrefix = "s.";
        } else {
            sql = `SELECT s.*${mlCols} FROM shipments s ${mlJoin} WHERE s.workspace_id = ?`;
            args.push(workspaceId);
            columnPrefix = "s.";
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
        if (connection_id && /^\d+$/.test(connection_id)) {
            sql += ` AND ${columnPrefix}integration_connection_id = ?`;
            args.push(Number(connection_id));
        }

        sql += ` ORDER BY ${orderBy} DESC`;

        const result = await db.execute({ sql, args });
        const rows = (result.rows || []).map((row) => {
            if (row.external_provider !== 'mercadolibre' && !row.ml_shipment_status && !row.ml_shipment_substatus) return row;
            const logistics = deriveMercadoLibreLogistics({
                shipmentId: row.external_shipment_id || '',
                shipmentStatus: row.ml_shipment_status || '',
                shipmentSubstatus: row.ml_shipment_substatus || '',
                logisticType: row.ml_logistic_type || '',
                shippingMethod: row.ml_shipping_method || row.shipping_method || '',
                leadTime: parseJson(row.ml_lead_time_json, {}),
                delays: parseJson(row.ml_delays_json, null),
                carrier: parseJson(row.ml_carrier_json, null),
                history: parseJson(row.ml_history_json, []),
                labelImportedAt: row.ml_label_imported_at || '',
                shipmentRowId: row.ml_shipment_row_id || row.id,
                labelDispatchDate: row.dispatch_date || '',
            });
            return {
                ...row,
                ml_package_state: logistics.packageState,
                ml_printability: logistics.printability,
                ml_cutoff: logistics.cutoff,
                ml_timeline: logistics.timeline,
            };
        });
        return NextResponse.json(rows);
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
        const fromDate = searchParams.get('from');
        const toDate = searchParams.get('to');

        let selected;
        if (batch_id) {
            selected = await db.execute({
                sql: "SELECT id FROM shipments WHERE workspace_id = ? AND batch_id = ?",
                args: [workspaceId, batch_id],
            });
        } else if (period) {
            const range = getDateRange(period, specificDate, fromDate, toDate);
            selected = await db.execute({
                sql: `SELECT id FROM shipments WHERE workspace_id = ? AND batch_id IN (
                    SELECT id FROM daily_batches WHERE workspace_id = ? AND date >= ? AND date <= ?
                )`,
                args: [workspaceId, workspaceId, range.from, range.to]
            });
        } else {
            selected = await db.execute({
                sql: "SELECT id FROM shipments WHERE workspace_id = ?",
                args: [workspaceId],
            });
        }

        const result = await deleteShipmentsByIds({
            workspaceId,
            ids: (selected?.rows || []).map((row) => row.id),
        });

        return NextResponse.json({ success: true, deleted: result.deleted });
    } catch (error) {
        console.error("Error clearing shipments:", error);
        return NextResponse.json({ error: "Failed to clear shipments" }, { status: 500 });
    }
}
