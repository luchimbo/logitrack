import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';

async function resolveWorkspaceIdByKey(workspaceKey) {
  if (!workspaceKey) return null;
  const key = String(workspaceKey).trim().slice(0, 200);
  if (!key) return null;
  const result = await db.execute({
    sql: 'SELECT workspace_id FROM workspace_printers WHERE workspace_key = ? LIMIT 1',
    args: [key],
  });
  if (!result.rows.length) throw new Error('workspace_key inválido');
  return Number(result.rows[0].workspace_id);
}

function checkAgentAuth(request) {
  const requiredToken = process.env.PRINT_AGENT_TOKEN;
  if (requiredToken) {
    const provided = request.headers.get('x-print-agent-token');
    if (provided !== requiredToken) return false;
  }
  return true;
}

// GET /api/print-queue/agent — agente reclama el siguiente job pending
export async function GET(request) {
  try {
    await ensureDb();
    if (!checkAgentAuth(request)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceKey = searchParams.get('workspace_key') || request.headers.get('x-workspace-key') || '';
    let workspaceId;
    try {
      workspaceId = await resolveWorkspaceIdByKey(workspaceKey);
    } catch {
      return NextResponse.json({ error: 'workspace_key inválido' }, { status: 400 });
    }
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspace_key requerido' }, { status: 400 });
    }

    // Tomar el job pending más antiguo y marcarlo claimed
    const pending = await db.execute({
      sql: `SELECT id, queue_job_id, zpl, labels_total FROM print_queue
            WHERE workspace_id = ? AND status = 'pending'
            ORDER BY id ASC LIMIT 1`,
      args: [workspaceId],
    });

    if (!pending.rows.length) {
      return NextResponse.json({ job: null });
    }

    const row = pending.rows[0];
    await db.execute({
      sql: `UPDATE print_queue SET status = 'claimed', claimed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [Number(row.id)],
    });

    return NextResponse.json({
      job: {
        queue_job_id: row.queue_job_id,
        zpl: row.zpl,
        labels_total: Number(row.labels_total),
      },
    });
  } catch (error) {
    console.error('print-queue agent GET error:', error);
    return NextResponse.json({ error: 'Error al reclamar job' }, { status: 500 });
  }
}

// POST /api/print-queue/agent — agente confirma resultado
export async function POST(request) {
  try {
    await ensureDb();
    if (!checkAgentAuth(request)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { queue_job_id, ok, error: jobError } = await request.json().catch(() => ({}));
    if (!queue_job_id) {
      return NextResponse.json({ error: 'queue_job_id requerido' }, { status: 400 });
    }

    if (ok) {
      await db.execute({
        sql: `UPDATE print_queue SET status = 'printed', printed_at = CURRENT_TIMESTAMP, error = NULL WHERE queue_job_id = ?`,
        args: [String(queue_job_id)],
      });
      // Marcar label_printed_at en las órdenes ML vinculadas a este job
      const jobRow = await db.execute({
        sql: `SELECT workspace_id, shipment_ids_json FROM print_queue WHERE queue_job_id = ? LIMIT 1`,
        args: [String(queue_job_id)],
      });
      if (jobRow.rows.length) {
        const { workspace_id, shipment_ids_json } = jobRow.rows[0];
        let shipmentIds = [];
        try { shipmentIds = JSON.parse(shipment_ids_json || '[]'); } catch { /* noop */ }
        for (const sid of shipmentIds) {
          await db.execute({
            sql: `UPDATE mercadolibre_orders SET label_printed_at = CURRENT_TIMESTAMP
                  WHERE workspace_id = ? AND (
                    shipment_row_id IN (SELECT id FROM shipments WHERE workspace_id = ? AND external_shipment_id = ?)
                    OR shipment_row_id IN (SELECT id FROM shipments WHERE workspace_id = ? AND id = ?)
                  ) AND label_printed_at IS NULL`,
            args: [Number(workspace_id), Number(workspace_id), String(sid), Number(workspace_id), Number(sid)],
          });
        }
      }
    } else {
      await db.execute({
        sql: `UPDATE print_queue SET status = 'failed', error = ? WHERE queue_job_id = ?`,
        args: [String(jobError || 'Error desconocido').slice(0, 500), String(queue_job_id)],
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('print-queue agent POST error:', error);
    return NextResponse.json({ error: 'Error al confirmar job' }, { status: 500 });
  }
}
