import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/privacidad(.*)",
  "/terminos(.*)",
  "/soporte(.*)",
  "/privacy(.*)",
  "/terms(.*)",
  "/support(.*)",
  "/login(.*)",
  "/sign-up(.*)",
  "/api/integrations/shopify/callback(.*)",
  "/api/integrations/tiendanube/callback(.*)",
  "/api/integrations/mercadolibre/callback(.*)",
  "/api/integrations/mercadolibre/start(.*)",
  "/api/integrations/zipnova/callback(.*)",
  "/api/webhooks/shopify(.*)",
  "/api/webhooks/tiendanube(.*)",
  "/api/webhooks/mercadolibre(.*)",
  "/api/v2/print-jobs/intake(.*)",
  "/api/v2/print-jobs/backfill(.*)",
  "/api/v2/print-jobs/recover(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return NextResponse.next();

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
