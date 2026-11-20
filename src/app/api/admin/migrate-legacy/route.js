import { NextResponse } from 'next/server';

// Historical migration could move or delete workspace data. It is no longer available.
export async function POST() {
  return NextResponse.json({ error: 'Esta herramienta de migración ya no está disponible.' }, { status: 410 });
}
