import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseZplFile } from '@/lib/zplParser';
import { assignCarrier } from '@/lib/zoneMapper';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

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
        const authResult = await requireWorkspaceActor(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }
        const workspaceId = authResult.actor.workspaceId;
        const actor = authResult.actor;
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
            let text = new TextDecoder('utf-8').decode(buffer);
            // If UTF-8 decoding produced replacement chars, fall back to Latin-1 (common for ZPL files)
            if (text.includes('\uFFFD')) {
                text = new TextDecoder('iso-8859-1').decode(buffer);
            }
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
                sql: "INSERT INTO daily_batches (workspace_id, created_by_app_user_id, filenames) VALUES (?, ?, ?)",
                args: [workspaceId, actor.appUserId, filenames.join(', ')]
            });
            batchId = Number(result.lastInsertRowid);
        }

        // Get existing shipments for this batch
        const existingResult = await db.execute({
            sql: "SELECT id, tracking_number, raw_zpl FROM shipments WHERE workspace_id = ? AND batch_id = ? AND tracking_number IS NOT NULL",
            args: [workspaceId, batchId]
        });
        const existingByTrack = new Map(existingResult.rows.map(r => [r.tracking_number, r]));

        // Insert or backfill shipments natively
        let saved = 0;
        let skipped = 0;
        let backfilled = 0;
        let withZpl = 0;
        let withoutZpl = 0;

        for (const s of allShipments) {
            const hasZpl = !!s.raw_zpl;
            if (hasZpl) withZpl++; else withoutZpl++;

            const existing = s.tracking_number ? existingByTrack.get(s.tracking_number) : null;

            if (existing) {
                if (!existing.raw_zpl && s.raw_zpl) {
                    await db.execute({
                        sql: "UPDATE shipments SET raw_zpl = ? WHERE id = ? AND workspace_id = ?",
                        args: [toDbValue(s.raw_zpl), existing.id, workspaceId]
                    });
                    backfilled++;
                } else {
                    skipped++;
                }
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
                toDbValue(s.raw_zpl),
            ];

            await db.execute({
                sql: `INSERT INTO shipments (
          batch_id, workspace_id, sale_type, sale_id, tracking_number, remitente_id, 
          product_name, sku, color, voltage, quantity, 
          recipient_name, recipient_user, address, postal_code, 
          city, partido, province, reference, shipping_method, 
          carrier_code, carrier_name, assigned_carrier, 
          dispatch_date, delivery_date, status, raw_zpl
        ) VALUES (
          ?, ?, ?, ?, ?, ?, 
          ?, ?, ?, ?, ?, 
          ?, ?, ?, ?, 
          ?, ?, ?, ?, ?, 
          ?, ?, ?, 
          ?, ?, ?, 'pendiente', ?
        )`,
                args
            });

            saved++;
            if (s.tracking_number) {
                existingByTrack.set(s.tracking_number, { id: null, raw_zpl: s.raw_zpl });
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

        await logAudit({
            workspaceId,
            appUserId: actor.appUserId,
            actorType: actor.authType,
            actorLabel: actor.email || actor.username,
            action: 'upload_labels',
            entityType: 'batch',
            entityId: batchId,
            metadata: {
                files: filenames,
                parsed: saved,
                skipped,
                backfilled,
                withZpl,
                withoutZpl,
                totalInBatch: finalBatch.rows[0].total_packages,
            },
        });

        return NextResponse.json({
            batch_id: batchId,
            total_parsed: saved,
            total_skipped: skipped,
            total_backfilled: backfilled,
            total_with_zpl: withZpl,
            total_without_zpl: withoutZpl,
            total_in_batch: finalBatch.rows[0].total_packages,
            filenames: filenames,
        });

    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: "File processing failed" }, { status: 500 });
    }
}
