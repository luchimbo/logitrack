import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
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
        const shipmentId = searchParams.get('shipmentId');

        if (!shipmentId) {
            return NextResponse.json({ error: "Missing shipmentId parameter" }, { status: 400 });
        }

        const result = await db.execute({
            sql: "SELECT raw_zpl FROM shipments WHERE id = ? AND workspace_id = ?",
            args: [shipmentId, workspaceId]
        });

        if (result.rows.length === 0) {
            return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
        }

        const rawZpl = result.rows[0].raw_zpl;

        if (!rawZpl) {
            return NextResponse.json({ error: "Label not available for this shipment" }, { status: 404 });
        }

        const labelaryUrl = 'http://api.labelary.com/v1/printers/8dpmm/labels/4x6/0/';
        const response = await fetch(labelaryUrl, {
            method: 'POST',
            headers: {
                'Accept': 'image/png',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: rawZpl,
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error("Labelary error:", errorText);
            return NextResponse.json({ error: "Failed to render label" }, { status: 502 });
        }

        const imageBuffer = await response.arrayBuffer();

        return new NextResponse(imageBuffer, {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=86400',
            },
        });
    } catch (error) {
        console.error("Error rendering label preview:", error);
        return NextResponse.json({ error: "Failed to render label preview" }, { status: 500 });
    }
}
