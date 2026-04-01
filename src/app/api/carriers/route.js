import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor, requireWorkspaceAdmin } from '@/lib/auth';

export async function GET(request) {
    try {
        await ensureDb();
        const authResult = await requireWorkspaceActor(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }
        const result = await db.execute({
            sql: "SELECT id, name, display_name, color FROM carriers WHERE workspace_id = ? ORDER BY name",
            args: [authResult.actor.workspaceId],
        });
        return NextResponse.json(result.rows);
    } catch (error) {
        console.error("Error fetching carriers:", error);
        return NextResponse.json({ error: "Failed to fetch carriers" }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        await ensureDb();
        const authResult = await requireWorkspaceAdmin(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }
        const workspaceId = authResult.actor.workspaceId;
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
            sql: "SELECT id FROM carriers WHERE workspace_id = ? AND name = ?",
            args: [workspaceId, cleanName]
        });

        if (existing.rows.length > 0) {
            await db.execute({
                sql: "UPDATE carriers SET display_name = ?, color = ? WHERE workspace_id = ? AND name = ?",
                args: [cleanDisplay, cleanColor, workspaceId, cleanName]
            });
            return NextResponse.json({ id: existing.rows[0].id, name: cleanName, display_name: cleanDisplay, color: cleanColor });
        } else {
            const result = await db.execute({
                sql: "INSERT INTO carriers (workspace_id, name, display_name, color) VALUES (?, ?, ?, ?)",
                args: [workspaceId, cleanName, cleanDisplay, cleanColor]
            });
            return NextResponse.json({ id: Number(result.lastInsertRowid), name: cleanName, display_name: cleanDisplay, color: cleanColor });
        }
    } catch (error) {
        console.error("Error creating/updating carrier:", error);
        return NextResponse.json({ error: "Failed to save carrier" }, { status: 500 });
    }
}
