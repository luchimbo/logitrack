"use client";

import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { safeAppReturn, signupPath } from "@/lib/oauthNavigation";
import GeoModiLogo from "@/components/GeoModiLogo";

function LoginForm() {
  const params = useSearchParams();
  const returnTo = safeAppReturn(params.get("returnTo"));
  return <SignIn routing="path" path="/login" signUpUrl={signupPath(returnTo)}
    fallbackRedirectUrl={returnTo} forceRedirectUrl={returnTo} />;
}

export default function LoginPage() {
  return (
    <main className="auth-page">
        <div className="auth-panel">
          <div className="auth-brand">
          <GeoModiLogo size="lg" centered />
          <p style={{ color: "var(--text-muted)", fontSize: "15px", marginTop: "10px" }}>Ingresá con tu email o Google para acceder a tu espacio.</p>
        </div>

        <div className="clerk-auth-shell" style={{ display: "flex", justifyContent: "center" }}>
          <Suspense fallback={<p>Cargando acceso…</p>}><LoginForm /></Suspense>
        </div>
      </div>
    </main>
  );
}
