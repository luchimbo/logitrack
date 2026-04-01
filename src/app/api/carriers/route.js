import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';

export async function GET() {
    try {
        await ensureDb();
        const result = await db.execute("SELECT id, name, display_name, color FROM carriers ORDER BY name");
        return NextResponse.json(result.rows);
    } catch (error) {
        console.error("Error fetching carriers:", error);
        return NextResponse.json({ error: "Failed to fetch carriers" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        await ensureDb();
        const { searchParams } = new URL(request.url);
        const name = searchParams.get('name');
        const display_name = searchParams.get('display_name');
        const color = searchParams.get('color');

        if (!name) {
            return NextResponse.json({ error: "Missing carrier name" }, { status: 400 });
        }

        const cleanName = name.trim();
        const cleanDisplay = display_name ? display_name.trim() : cleanName;
        const cleanColor = color || "#6366f1";

        const existing = await db.execute({
            sql: "SELECT id FROM carriers WHERE name = ?",
            args: [cleanName]
        });

        if (existing.rows.length > 0) {
            await db.execute({
                sql: "UPDATE carriers SET display_name = ?, color = ? WHERE name = ?",
                args: [cleanDisplay, cleanColor, cleanName]
            });
            return NextResponse.json({ id: existing.rows[0].id, name: cleanName, display_name: cleanDisplay, color: cleanColor });
        } else {
            const result = await db.execute({
                sql: "INSERT INTO carriers (name, display_name, color) VALUES (?, ?, ?)",
                args: [cleanName, cleanDisplay, cleanColor]
            });
            return NextResponse.json({ id: Number(result.lastInsertRowid), name: cleanName, display_name: cleanDisplay, color: cleanColor });
        }
    } catch (error) {
        console.error("Error creating/updating carrier:", error);
        return NextResponse.json({ error: "Failed to save carrier" }, { status: 500 });
    }
}
