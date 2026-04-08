import { NextResponse } from 'next/server';
import { getCurrentActor } from '@/lib/auth';

export async function GET(request) {
  try {
    const actor = await getCurrentActor(request);
    if (!actor) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: actor.id,
        username: actor.username,
        email: actor.email,
        role: actor.role,
        authType: actor.authType,
        isGlobalAdmin: actor.isGlobalAdmin,
        workspaceId: actor.workspaceId,
        workspaceName: actor.workspaceName,
        workspaceSlug: actor.workspaceSlug,
        printingSetupCompleted: actor.printingSetupCompleted,
        onboardingCompleted: actor.onboardingCompleted,
      },
    });
  } catch (error) {
    console.error('Auth me error:', error);
    return NextResponse.json({ error: 'Error en el servidor' }, { status: 500 });
  }
}
