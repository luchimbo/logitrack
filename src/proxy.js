import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/demo-finance",
  "/privacidad(.*)",
  "/terminos(.*)",
  "/soporte(.*)",
  "/privacy(.*)",
  "/terms(.*)",
  "/support(.*)",
  "/login(.*)",
  "/sign-up(.*)",
  "/transportista(.*)",
  "/api/public/carrier-portals(.*)",
  "/api/integrations/shopify/callback(.*)",
  "/api/integrations/tiendanube/callback(.*)",
  "/api/integrations/mercadolibre/callback(.*)",
  "/api/integrations/mercadolibre/start(.*)",
  "/api/integrations/zipnova/callback(.*)",
  "/api/webhooks/shopify(.*)",
  "/api/webhooks/tiendanube(.*)",
  "/api/webhooks/mercadolibre(.*)",
  "/api/cron/mercadolibre-sync",
  "/connect/mercadolibre(.*)",
  "/api/connect/mercadolibre(.*)",
  "/api/v2/print-jobs/intake(.*)",
  "/api/v2/print-jobs/backfill(.*)",
  "/api/v2/print-jobs/recover(.*)",
]);

const authenticatedMiddleware = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return NextResponse.next();

  const { userId } = await auth();
  if (userId) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", req.url));
});

export default function proxy(request, event) {
  if (process.env.NODE_ENV === 'development' && process.env.LOCAL_FINANCE_DEMO === '1' && request.nextUrl.pathname === '/demo-finance') return NextResponse.next();
  return authenticatedMiddleware(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|wasm)).*)",
    "/(api|trpc)(.*)",
  ],
};
