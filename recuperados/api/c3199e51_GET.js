import { NextResponse } from 'next/server';
import { requireWorkspaceAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';

const DEFAULT_SETTINGS = {
  companyName: '',
  defaultCarrier: '',
  autoAssignZone: false,
  notifyOnIncident: true,
  printFormat: 'zpl',
  timezone: 'America/Argentina/Buenos_Aires',
  language: 'es',
};

async function ensureSettingsSchema() {
  await ensureDb();
  try {
    await db.execute('ALTER TABLE workspace_settings ADD COLUMN settings_json TEXT');
  } catch (error) {
    if (!String(error?.message || '').toLowerCase().includes('duplicate')) {
      throw error;
    }
  }
}

function sanitizeSettings(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    companyName: String(input.companyName || '').slice(0, 120),
    defaultCarrier: String(input.defaultCarrier || '').slice(0, 120),
    autoAssignZone: Boolean(input.autoAssignZone),
    notifyOnIncident: input.notifyOnIncident !== false,
    printFormat: ['zpl', 'pdf', 'png'].includes(input.printFormat) ? input.printFormat : 'zpl',
    timezone: String(input.timezone || DEFAULT_SETTINGS.timezone).slice(0, 80),
    language: ['es', 'pt'].includes(input.language) ? input.language : 'es',
  };
}

async function readSettings(workspaceId) {
  await ensureSettingsSchema();
  const result = await db.execute({
    sql: `SELECT settings_json FROM workspace_settings WHERE workspace_id = ? LIMIT 1`,
    args: [workspaceId],
  });
  const row = result.rows?.[0];
  if (!row?.settings_json) return DEFAULT_SETTINGS;

  try {
    return { ...DEFAULT_SETTINGS, ...sanitizeSettings(JSON.parse(row.settings_json)) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function GET(request) {
  try {
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const settings = await readSettings(authResult.actor.workspaceId);
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json({ error: error.message || 'No se pudo cargar la configuración' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const authResult = await requireWorkspaceAdmin(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const body = await request.json().catch(() => ({}));
    const settings = sanitizeSettings(body);
    await ensureSettingsSchema();
    await db.execute({
      sql: `INSERT INTO workspace_settings (workspace_id, settings_json)
            VALUES (?, ?)
            ON CONFLICT(workspace_id) DO UPDATE SET settings_json = excluded.settings_json`,
      args: [authResult.actor.workspaceId, JSON.stringify(settings)],
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Settings PUT error:', error);
    return NextResponse.json({ error: error.message || 'No se pudo guardar la configuración' }, { status: 500 });
  }
}
