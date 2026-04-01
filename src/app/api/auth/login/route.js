import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { logAudit } from '@/lib/audit';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'logitrack-super-secret-key-2026-local');

export async function POST(request) {
    try {
        await ensureDb();
        const { username, password } = await request.json();

        if (!username || !password) {
            return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
        }

        const result = await db.execute({
            sql: "SELECT id, username, password_hash, role FROM users WHERE username = ?",
            args: [username]
        });

        if (result.rows.length === 0) {
            return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
        }

        const user = result.rows[0];
        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
            return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
        }

        // Crear token JWT con la librería 'jose'
        const token = await new SignJWT({ id: user.id, username: user.username, role: user.role || 'user' })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('30d') // Expira en 30 días
            .sign(JWT_SECRET);

        const response = NextResponse.json({ success: true, user: { username: user.username } });

        // Guardar token en cookie segura (HTTP-only)
        response.cookies.set({
            name: 'auth_token',
            value: token,
            httpOnly: true,
            path: '/',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24 * 30, // 30 días en segundos
            sameSite: 'lax'
        });

        await logAudit({
            workspaceId: null,
            actorType: 'legacy-admin',
            actorLabel: user.username,
            action: 'admin_login',
            entityType: 'user',
            entityId: user.id,
        });

        return response;
    } catch (error) {
        console.error("Login Error:", error);
        return NextResponse.json({ error: "Error en el servidor" }, { status: 500 });
    }
}
