import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceAdmin } from '@/lib/auth';

function buildWorkspaceKey(workspaceSlug) {
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `${workspaceSlug || 'workspace'}-${random}`;
}

export async function GET(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const workspaceId = authResult.actor.workspaceId;
    const [printerResult, settingsResult] = await Promise.all([
      db.execute({
        sql: 'SELECT id, name, printer_path, sync_url, sync_token, workspace_key, is_default FROM workspace_printers WHERE workspace_id = ? ORDER BY is_default DESC, id ASC LIMIT 1',
        args: [workspaceId],
      }),
      db.execute({
        sql: 'SELECT printing_setup_completed FROM workspace_settings WHERE workspace_id = ? LIMIT 1',
        args: [workspaceId],
      }),
    ]);

    return NextResponse.json({
      printer: printerResult.rows[0] || null,
      printing_setup_completed: Boolean(settingsResult.rows[0]?.printing_setup_completed),
      workspace: {
        id: workspaceId,
        name: authResult.actor.workspaceName,
        slug: authResult.actor.workspaceSlug,
      },
    });
  } catch (error) {
    console.error('Workspace setup GET error:', error);
    return NextResponse.json({ error: 'Error al cargar configuración' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const workspaceId = authResult.actor.workspaceId;
    const body = await request.json();
    const printerName = String(body.name || 'Impresora principal').trim();
    const printerPath = String(body.printerPath || '').trim();
    const syncUrl = String(body.syncUrl || '').trim();
    const syncToken = String(body.syncToken || '').trim();
    const workspaceKey = String(body.workspaceKey || '').trim() || buildWorkspaceKey(authResult.actor.workspaceSlug);

    if (!printerPath || !syncUrl) {
      return NextResponse.json({ error: 'printerPath y syncUrl son obligatorios' }, { status: 400 });
    }

    const existing = await db.execute({
      sql: 'SELECT id FROM workspace_printers WHERE workspace_id = ? ORDER BY is_default DESC, id ASC LIMIT 1',
      args: [workspaceId],
    });

    if (existing.rows.length) {
      await db.execute({
        sql: `UPDATE workspace_printers
              SET name = ?, printer_path = ?, sync_url = ?, sync_token = ?, workspace_key = ?, is_default = 1
              WHERE id = ? AND workspace_id = ?`,
        args: [printerName, printerPath, syncUrl, syncToken, workspaceKey, existing.rows[0].id, workspaceId],
      });
    } else {
      await db.execute({
        sql: `INSERT INTO workspace_printers (workspace_id, name, printer_path, sync_url, sync_token, workspace_key, is_default)
              VALUES (?, ?, ?, ?, ?, ?, 1)`,
        args: [workspaceId, printerName, printerPath, syncUrl, syncToken, workspaceKey],
      });
    }

    await db.execute({
      sql: 'INSERT INTO workspace_settings (workspace_id, printing_setup_completed) VALUES (?, 1) ON CONFLICT(workspace_id) DO UPDATE SET printing_setup_completed = 1',
      args: [workspaceId],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Workspace setup PATCH error:', error);
    return NextResponse.json({ error: 'Error al guardar configuración' }, { status: 500 });
  }
}
