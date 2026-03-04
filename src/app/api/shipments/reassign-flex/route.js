import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { assignCarrier } from '@/lib/zoneMapper';

export async function POST(request) {
    try {
        const { searchParams } = new URL(request.url);
        const batch_id = searchParams.get('batch_id');

        let sql = "SELECT id, partido, assigned_carrier FROM shipments WHERE shipping_method = 'flex'";
        const args = [];

        if (batch_id) {
            sql += " AND batch_id = ?";
            args.push(batch_id);
        }

        const result = await db.execute({ sql, args });
        const shipments = result.rows;

        let updatedCount = 0;

        for (const s of shipments) {
            const newCarrier = await assignCarrier(s.partido);
            if (s.assigned_carrier !== newCarrier) {
                await db.execute({
                    sql: "UPDATE shipments SET assigned_carrier = ? WHERE id = ?",
                    args: [newCarrier, s.id]
                });
                updatedCount++;
            }
        }

        return NextResponse.json({ updated: updatedCount, total_checked: shipments.length });
    } catch (error) {
        console.error("Error reassigning flex carriers:", error);
        return NextResponse.json({ error: "Failed to reassign carriers" }, { status: 500 });
    }
}
