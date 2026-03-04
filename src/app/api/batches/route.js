import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
    try {
        const result = await db.execute("SELECT * FROM daily_batches ORDER BY id DESC LIMIT 20");
        return NextResponse.json(result.rows);
    } catch (error) {
        console.error("Batches error:", error);
        return NextResponse.json({ error: "Failed to load batches" }, { status: 500 });
    }
}
