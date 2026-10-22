import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { legacyTiendanubeReturn, loginPath } from "./lib/oauthNavigation";

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
  "/connect/mercadolibre(.*)",
  "/api/connect/mercadolibre(.*)",
  "/api/v2/print-jobs/intake(.*)",
  "/api/v2/print-jobs/backfill(.*)",
  "/api/v2/print-jobs/recover(.*)",
]);

const clerkGuard = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return NextResponse.next();

  const { userId } = await auth();
  if (userId) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return NextResponse.redirect(new URL(loginPath(req.nextUrl.pathname + req.nextUrl.search), req.url));
});

export default function proxy(req, event) {
  // Las instalaciones anteriores regresaban a la portada pública. Recuperar
  // exclusivamente los parámetros de TN, sin cambiar la portada normal.
  if (req.nextUrl.pathname === "/") {
    const target = legacyTiendanubeReturn(req.nextUrl.searchParams);
    if (target) return NextResponse.redirect(new URL(target, req.url));
  }
  // Esta única ruta verifica HMAC por tienda en su handler. No requiere sesión
  // ni consultas a Clerk para la comunicación entre servidores.
  if (req.nextUrl.pathname === "/api/cross-selling/config") return NextResponse.next();
  // Mostrador usa HMAC por tienda; estas rutas validan la firma en sus handlers.
  if (req.nextUrl.pathname === "/api/cross-selling/module") return NextResponse.next();
  if (req.nextUrl.pathname === "/api/cross-selling/report") return NextResponse.next();
  if (/^\/api\/cross-selling\/demo-callback\/[a-f0-9]{64}$/.test(req.nextUrl.pathname)) return NextResponse.next();
  // Módulo «Completá tu equipo» de la demo: firma en la URL o validación de origen y carrito en el handler.
  if (/^\/api\/cross-selling\/offer-callback\/[a-f0-9]{32}$/.test(req.nextUrl.pathname)) return NextResponse.next();
  if (/^\/api\/cross-selling\/storefront\/(offers|accept|seen)$/.test(req.nextUrl.pathname)) return NextResponse.next();
  // Reseñas: Mostrador publica con HMAC por tienda; la tienda lee con validación de origen en el handler.
  if (req.nextUrl.pathname === "/api/reviews/config" || req.nextUrl.pathname === "/api/reviews/storefront") return NextResponse.next();
  return clerkGuard(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|wasm)).*)",
    "/(api|trpc)(.*)",
  ],
};
