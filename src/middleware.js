import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'logitrack-super-secret-key-2026-local');

export async function middleware(request) {
    const { pathname } = request.nextUrl;

    // Ignorar rutas públicas, assets estáticos e imágenes
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/api/auth/login') ||
        pathname.startsWith('/login') ||
        pathname.includes('.') // asume que si tiene un punto es un archivo (favicon.ico, styles.css)
    ) {
        return NextResponse.next();
    }

    // Obtener token
    const token = request.cookies.get('auth_token')?.value;

    // Si no hay token 
    if (!token) {
        // Redirigir a /login si es navegación UI
        if (!pathname.startsWith('/api/')) {
            const loginUrl = new URL('/login', request.url);
            return NextResponse.redirect(loginUrl);
        }
        // Retornar 401 si es petición de API
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Validar token
    try {
        await jwtVerify(token, JWT_SECRET);
        return NextResponse.next();
    } catch (e) {
        // Token inválido o expirado
        const loginUrl = new URL('/login', request.url);
        // Limpiamos la cookie mala
        const response = pathname.startsWith('/api/')
            ? NextResponse.json({ error: 'Token expirado' }, { status: 401 })
            : NextResponse.redirect(loginUrl);

        response.cookies.delete('auth_token');
        return response;
    }
}

// Configurar sobre qué rutas corre el middleware (todas menos ciertas exclusiones iniciales)
export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
