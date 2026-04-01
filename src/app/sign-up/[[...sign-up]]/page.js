"use client";

import Link from "next/link";
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
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
          <h1 style={{ fontSize: "32px", fontWeight: 800, marginBottom: "8px" }}>Crear cuenta</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "15px" }}>Podés registrarte con email o Google. Cada cuenta crea un espacio aislado llamado Mi espacio.</p>
        </div>

        <div className="clerk-auth-shell" style={{ display: "flex", justifyContent: "center" }}>
          <SignUp
            routing="path"
            path="/sign-up"
            signInUrl="/login"
            fallbackRedirectUrl="/"
            forceRedirectUrl="/"
          />
        </div>

        <div style={{ textAlign: "center", marginTop: "16px" }}>
          <Link href="/admin-login" style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            Ingresar como admin local
          </Link>
        </div>

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
