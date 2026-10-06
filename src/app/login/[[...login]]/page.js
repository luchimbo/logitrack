"use client";

import { SignIn } from "@clerk/nextjs";
import GeoModiLogo from "@/components/GeoModiLogo";

export default function LoginPage() {
  return (
    <main className="auth-page">
        <div className="auth-panel">
          <div className="auth-brand">
          <GeoModiLogo size="lg" centered />
          <p style={{ color: "var(--text-muted)", fontSize: "15px", marginTop: "10px" }}>Ingresá con tu email o Google para acceder a tu espacio.</p>
        </div>

        <div className="clerk-auth-shell" style={{ display: "flex", justifyContent: "center" }}>
          <SignIn
            routing="path"
            path="/login"
            signUpUrl="/sign-up"
            fallbackRedirectUrl="/app"
            forceRedirectUrl="/app"
          />
        </div>
      </div>
    </main>
  );
}
