import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseZplFile } from '@/lib/zplParser';
import { assignCarrier } from '@/lib/zoneMapper';

export const config = {
    api: {
        bodyParser: false,
    },
};

export async function POST(request) {
    try {
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
                    shipment.assigned_carrier = await assignCarrier(shipment.partido);
                }
            }
            allShipments.push(...parsed);
        }

        // Daily batch management
        let batchId;
        const todayResult = await db.execute("SELECT id, filenames FROM daily_batches WHERE date = CURRENT_DATE");

        if (todayResult.rows.length > 0) {
            batchId = todayResult.rows[0].id;
            const currentFiles = todayResult.rows[0].filenames ? todayResult.rows[0].filenames.split(', ') : [];
            const newNames = new Set([...currentFiles, ...filenames]);
            await db.execute({
                sql: "UPDATE daily_batches SET filenames = ? WHERE id = ?",
                args: [Array.from(newNames).join(', '), batchId]
            });
        } else {
            const result = await db.execute({
                sql: "INSERT INTO daily_batches (filenames) VALUES (?)",
                args: [filenames.join(', ')]
            });
            batchId = Number(result.lastInsertRowid);
        }

        // Get existing tracking numbers for this batch
        const existingResult = await db.execute({
            sql: "SELECT tracking_number FROM shipments WHERE batch_id = ? AND tracking_number IS NOT NULL",
            args: [batchId]
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

            await db.execute({
                sql: `INSERT INTO shipments (
          batch_id, sale_type, sale_id, tracking_number, remitente_id, 
          product_name, sku, color, voltage, quantity, 
          recipient_name, recipient_user, address, postal_code, 
          city, partido, province, reference, shipping_method, 
          carrier_code, carrier_name, assigned_carrier, 
          dispatch_date, delivery_date, status
        ) VALUES (
          ?, ?, ?, ?, ?, 
          ?, ?, ?, ?, ?, 
          ?, ?, ?, ?, 
          ?, ?, ?, ?, ?, 
          ?, ?, ?, 
          ?, ?, 'pendiente'
        )`,
                args: [
                    batchId, s.sale_type, s.sale_id, s.tracking_number, s.remitente_id,
                    s.product_name, s.sku, s.color, s.voltage, s.quantity,
                    s.recipient_name, s.recipient_user, s.address, s.postal_code,
                    s.city, s.partido, s.province, s.reference, s.shipping_method,
                    s.carrier_code, s.carrier_name, s.assigned_carrier,
                    s.dispatch_date, s.delivery_date
                ]
            });

            saved++;
            if (s.tracking_number) {
                existingTracks.add(s.tracking_number);
            }
        }

        // Update batch totals
        await db.execute({
            sql: "UPDATE daily_batches SET total_packages = (SELECT COUNT(*) FROM shipments WHERE batch_id = ?) WHERE id = ?",
            args: [batchId, batchId]
        });

        const finalBatch = await db.execute({
            sql: "SELECT total_packages FROM daily_batches WHERE id = ?",
            args: [batchId]
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
