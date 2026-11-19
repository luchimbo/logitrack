import { NextResponse } from 'next/server';

// Historical repair moved data between workspaces. It is no longer available.
export async function POST() {
  return NextResponse.json({ error: 'Esta herramienta de reparación ya no está disponible.' }, { status: 410 });
}
