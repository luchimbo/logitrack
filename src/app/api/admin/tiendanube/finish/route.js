import { NextResponse } from 'next/server';
import { requireWorkspaceAdmin } from '@/lib/auth';
import { saveIntegration } from '@/lib/integrationService';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';

async function popOauthSession(storeId, retries = 5) {
  await ensureDb();
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await db.execute({
      sql: `SELECT access_token, scope, expires_at
            FROM tiendanube_oauth_sessions
            WHERE store_id = ? AND expires_at > datetime('now')
            LIMIT 1`,
      args: [storeId],
    });
    if (result.rows.length) {
      const row = result.rows[0];
      await db.execute({
        sql: `DELETE FROM tiendanube_oauth_sessions WHERE store_id = ?`,
        args: [storeId],
      });
      return {
        accessToken: row.access_token,
        scope: row.scope,
      };
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
  return null;
}

export async function POST(request) {
  try {
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const body = await request.json();
    const storeId = String(body?.storeId || '').trim();

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es obligatorio' }, { status: 400 });
    }

    const session = await popOauthSession(storeId);
    if (!session) {
      return NextResponse.json({ error: 'Sesión de autorizacion no encontrada o expirada. Volvé a intentar la conexion.' }, { status: 400 });
    }

    const workspaceId = authResult.actor.workspaceId;
    await saveIntegration({
      workspaceId,
      provider: 'tiendanube',
      config: {
        accessToken: session.accessToken,
        tokenType: 'bearer',
        scope: session.scope,
        storeId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Tiendanube finish error:', error);
    return NextResponse.json({ error: error.message || 'Error al finalizar la conexion con Tiendanube' }, { status: 500 });
  }
}
