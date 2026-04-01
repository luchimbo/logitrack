import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseZplFile } from '@/lib/zplParser';
import { assignCarrier } from '@/lib/zoneMapper';
import { ensureDb } from '@/lib/ensureDb';
import { requireGlobalAdmin } from '@/lib/auth';

function toDbValue(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' || typeof value === 'bigint') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    return String(value);
}

export async function POST(request) {
    try {
        await ensureDb();
        const authResult = await requireGlobalAdmin(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }
        const workspaceId = authResult.actor.workspaceId;
        const formData = await request.formData();
        const files = formData.getAll('files');

        if (!files || files.length === 0) {
            return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
        }

        const allShipments = [];
        const filenames = [];

        // Parse all files
        for (const file of files) {
            const buffer = await file.arrayBuffer();
            // Simple decode, might need latin-1 fallback like python depending on node versions
            const text = new TextDecoder('utf-8').decode(buffer);
            filenames.push(file.name);

            const parsed = parseZplFile(text);
            for (const shipment of parsed) {
                if (shipment.shipping_method === 'flex' && shipment.partido) {
                    shipment.assigned_carrier = await assignCarrier(shipment.partido, workspaceId);
                }
            }
            allShipments.push(...parsed);
        }

        // Daily batch management
        let batchId;
        const todayResult = await db.execute({
            sql: "SELECT id, filenames FROM daily_batches WHERE workspace_id = ? AND date = CURRENT_DATE",
            args: [workspaceId],
        });

        if (todayResult.rows.length > 0) {
            batchId = Number(todayResult.rows[0].id);
            const currentFiles = todayResult.rows[0].filenames ? todayResult.rows[0].filenames.split(', ') : [];
            const newNames = new Set([...currentFiles, ...filenames]);
            await db.execute({
                sql: "UPDATE daily_batches SET filenames = ? WHERE id = ?",
                args: [Array.from(newNames).join(', '), batchId]
            });
        } else {
            const result = await db.execute({
                sql: "INSERT INTO daily_batches (workspace_id, filenames) VALUES (?, ?)",
                args: [workspaceId, filenames.join(', ')]
            });
            batchId = Number(result.lastInsertRowid);
        }

        // Get existing tracking numbers for this batch
        const existingResult = await db.execute({
            sql: "SELECT tracking_number FROM shipments WHERE workspace_id = ? AND batch_id = ? AND tracking_number IS NOT NULL",
            args: [workspaceId, batchId]
        });
        const existingTracks = new Set(existingResult.rows.map(r => r.tracking_number));

        // Insert new shipments natively
        let saved = 0;
        let skipped = 0;

        for (const s of allShipments) {
            if (s.tracking_number && existingTracks.has(s.tracking_number)) {
                skipped++;
                continue;
            }

            const args = [
                toDbValue(batchId),
                toDbValue(workspaceId),
                toDbValue(s.sale_type),
                toDbValue(s.sale_id),
                toDbValue(s.tracking_number),
                toDbValue(s.remitente_id),
                toDbValue(s.product_name),
                toDbValue(s.sku),
                toDbValue(s.color),
                toDbValue(s.voltage),
                toDbValue(s.quantity ?? 1),
                toDbValue(s.recipient_name),
                toDbValue(s.recipient_user),
                toDbValue(s.address),
                toDbValue(s.postal_code),
                toDbValue(s.city),
                toDbValue(s.partido),
                toDbValue(s.province),
                toDbValue(s.reference),
                toDbValue(s.shipping_method),
                toDbValue(s.carrier_code),
                toDbValue(s.carrier_name),
                toDbValue(s.assigned_carrier),
                toDbValue(s.dispatch_date),
                toDbValue(s.delivery_date),
            ];

            await db.execute({
                sql: `INSERT INTO shipments (
          batch_id, workspace_id, sale_type, sale_id, tracking_number, remitente_id, 
          product_name, sku, color, voltage, quantity, 
          recipient_name, recipient_user, address, postal_code, 
          city, partido, province, reference, shipping_method, 
          carrier_code, carrier_name, assigned_carrier, 
          dispatch_date, delivery_date, status
        ) VALUES (
          ?, ?, ?, ?, ?, ?, 
          ?, ?, ?, ?, ?, 
          ?, ?, ?, ?, 
          ?, ?, ?, ?, ?, 
          ?, ?, ?, 
          ?, ?, 'pendiente'
        )`,
                args
            });

            saved++;
            if (s.tracking_number) {
                existingTracks.add(s.tracking_number);
            }
        }

        // Update batch totals
        await db.execute({
            sql: "UPDATE daily_batches SET total_packages = (SELECT COUNT(*) FROM shipments WHERE workspace_id = ? AND batch_id = ?) WHERE id = ? AND workspace_id = ?",
            args: [workspaceId, batchId, batchId, workspaceId]
        });

        const finalBatch = await db.execute({
            sql: "SELECT total_packages FROM daily_batches WHERE id = ? AND workspace_id = ?",
            args: [batchId, workspaceId]
        });

        return NextResponse.json({
            batch_id: batchId,
            total_parsed: saved,
            total_skipped: skipped,
            total_in_batch: finalBatch.rows[0].total_packages,
            filenames: filenames,
        });

    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: "File processing failed" }, { status: 500 });
    }
}
