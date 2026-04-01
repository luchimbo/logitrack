import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { requireGlobalAdmin } from '@/lib/auth';

export async function GET(request) {
    try {
        const authResult = await requireGlobalAdmin(request);
        if (authResult.error) {
            return NextResponse.json(authResult.error.body, { status: authResult.error.status });
        }

        const correctHash = await bcrypt.hash("123456", 10);

        // Crear tabla por las dudas
        await db.execute(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        const check = await db.execute("SELECT id FROM users WHERE username = 'admin'");
        if (check.rows.length === 0) {
            await db.execute({
                sql: "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                args: ['admin', correctHash]
            });
        } else {
            await db.execute({
                sql: "UPDATE users SET password_hash = ? WHERE username = 'admin'",
                args: [correctHash]
            });
        }

        return NextResponse.json({ success: true, message: "Admin password configured to 123456" });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
