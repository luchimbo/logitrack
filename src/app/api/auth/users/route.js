import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import bcrypt from 'bcryptjs';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'logitrack-super-secret-key-2026-local');

async function requireAdmin(request) {
    const token = request.cookies.get('auth_token')?.value;
    if (!token) {
        return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
    }

    try {
        const verified = await jwtVerify(token, JWT_SECRET);
        const payload = verified.payload;

        if (payload.role !== 'admin') {
            return { error: NextResponse.json({ error: 'Solo admin puede gestionar usuarios' }, { status: 403 }) };
        }

        return { payload };
    } catch {
        return { error: NextResponse.json({ error: 'Token invalido' }, { status: 401 }) };
    }
}

export async function GET(request) {
    try {
        await ensureDb();
        const auth = await requireAdmin(request);
        if (auth.error) return auth.error;

        const result = await db.execute('SELECT id, username, role, created_at FROM users ORDER BY username ASC');
        return NextResponse.json({ users: result.rows });
    } catch (error) {
        console.error('List Users Error:', error);
        return NextResponse.json({ error: 'Error en el servidor' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        await ensureDb();
        const auth = await requireAdmin(request);
        if (auth.error) return auth.error;

        const { username, password, role } = await request.json();

        if (!username || !password) {
            return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
        }

        const cleanRole = role === 'admin' ? 'admin' : 'user';
        const passwordHash = await bcrypt.hash(password, 10);

        await db.execute({
            sql: 'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
            args: [username, passwordHash, cleanRole],
        });

        return NextResponse.json({ success: true, user: { username, role: cleanRole } }, { status: 201 });
    } catch (error) {
        const message = String(error?.message || '');
        if (message.includes('UNIQUE constraint failed')) {
            return NextResponse.json({ error: 'El usuario ya existe' }, { status: 409 });
        }

        console.error('Create User Error:', error);
        return NextResponse.json({ error: 'Error en el servidor' }, { status: 500 });
    }
}

export async function PATCH(request) {
    try {
        await ensureDb();
        const auth = await requireAdmin(request);
        if (auth.error) return auth.error;

        const { username, newPassword } = await request.json();

        if (!username || !newPassword || String(newPassword).length < 6) {
            return NextResponse.json({ error: 'Datos invalidos' }, { status: 400 });
        }

        const passwordHash = await bcrypt.hash(String(newPassword), 10);
        const result = await db.execute({
            sql: 'UPDATE users SET password_hash = ? WHERE username = ?',
            args: [passwordHash, username],
        });

        if (!result.rowsAffected) {
            return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Reset Password Error:', error);
        return NextResponse.json({ error: 'Error en el servidor' }, { status: 500 });
    }
}
