import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'logitrack-super-secret-key-2026-local');

export async function GET(request) {
    try {
        const token = request.cookies.get('auth_token')?.value;

        if (!token) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { payload } = await jwtVerify(token, JWT_SECRET);

        return NextResponse.json({
            user: {
                id: payload.id,
                username: payload.username,
                role: payload.role || 'user',
            },
        });
    } catch {
        return NextResponse.json({ error: 'Token invalido' }, { status: 401 });
    }
}
