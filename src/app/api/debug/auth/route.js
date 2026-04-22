import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const clerkAuth = await auth();
    console.log("[debug-auth] clerkAuth:", JSON.stringify(clerkAuth, null, 2));
    
    return NextResponse.json({
      hasAuth: !!clerkAuth,
      userId: clerkAuth?.userId || null,
      sessionClaims: clerkAuth?.sessionClaims || null,
      sessionId: clerkAuth?.sessionId || null,
      actor: clerkAuth?.actor || null,
    });
  } catch (error) {
    console.error("[debug-auth] Error:", error);
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}