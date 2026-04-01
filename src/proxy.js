import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "logitrack-super-secret-key-2026-local");

const isPublicRoute = createRouteMatcher([
  "/login(.*)",
  "/sign-up(.*)",
  "/admin-login(.*)",
  "/api/auth/login(.*)",
  "/api/v2/print-jobs/intake(.*)",
  "/api/v2/print-jobs/backfill(.*)",
  "/api/v2/print-jobs/recover(.*)",
]);

async function hasLegacyAdminToken(req) {
  const token = req.cookies.get("auth_token")?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return NextResponse.next();

  const legacyAdmin = await hasLegacyAdminToken(req);
  if (legacyAdmin) return NextResponse.next();

  const { userId } = await auth();
  if (userId) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", req.url));
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
