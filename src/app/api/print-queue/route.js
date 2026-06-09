import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/ensureDb';
import { requireWorkspaceActor } from '@/lib/auth';
import { enqueuePrintQueue } from '@/lib/printQueue';

export async function POST(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const { ids } = await request.json().catch(() => ({}));
    const queued = await enqueuePrintQueue({
      workspaceId: authResult.actor.workspaceId,
      actorId: authResult.actor.id || null,
      shipmentIds: ids,
    });

    return NextResponse.json({ queue_job_id: queued.queue_job_id, labels_total: queued.labels_total });
  } catch (error) {
    console.error('print-queue POST error:', error);
    return NextResponse.json({ error: error.message || 'Error al encolar impresion' }, { status: error.status || 500 });
  }
}

export async function GET(request) {
  try {
    await ensureDb();
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const result = await db.execute({
      sql: `SELECT id, queue_job_id, status, labels_total, claimed_at, printed_at, error, created_at
            FROM print_queue WHERE workspace_id = ? ORDER BY id DESC LIMIT 50`,
      args: [authResult.actor.workspaceId],
    });

    return NextResponse.json({ jobs: result.rows });
  } catch (error) {
    console.error('print-queue GET error:', error);
    return NextResponse.json({ error: 'Error al listar cola' }, { status: 500 });
  }
}
