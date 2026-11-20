"use client";

import { SignIn } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import GeoModiLogo from "@/components/GeoModiLogo";

export default function LoginPage() {
  const isDev = process.env.NODE_ENV === "development";
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url") || "/app";

  const loginAsCamilo = async () => {
    try {
      const res = await fetch("/api/dev/login-as-camilo", { method: "POST" });
      if (!res.ok) throw new Error("Error " + res.status);
      window.location.href = "/app";
    } catch (e) {
      alert("No se pudo entrar en modo desarrollo: " + e.message);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-secondary)",
        padding: "24px",
      }}
    >
        <div style={{ width: "100%", maxWidth: "460px" }}>
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <GeoModiLogo size="lg" centered />
          <p style={{ color: "var(--text-muted)", fontSize: "15px", marginTop: "10px" }}>Ingresá con tu email o Google para acceder a tu espacio.</p>
        </div>

        <div className="clerk-auth-shell" style={{ display: "flex", justifyContent: "center" }}>
          <SignIn
            routing="path"
            path="/login"
            signUpUrl="/sign-up"
            fallbackRedirectUrl={redirectUrl}
            forceRedirectUrl={redirectUrl}
          />
        </div>

        {isDev && (
          <div style={{ marginTop: "24px", textAlign: "center" }}>
            <button
              onClick={loginAsCamilo}
              style={{
                padding: "10px 18px",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text-muted)",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Entrar como Camilo (solo dev)
            </button>
          </div>
        )}

        <style jsx global>{`
          .clerk-auth-shell input {
            color: #f1f5f9 !important;
          }

          .clerk-auth-shell input::placeholder {
            color: #94a3b8 !important;
            opacity: 1 !important;
          }
        `}</style>
      </div>
    </div>
  );
}
