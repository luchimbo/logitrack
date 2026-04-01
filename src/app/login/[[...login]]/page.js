"use client";

import Link from "next/link";
import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
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
          <h1 style={{ fontSize: "32px", fontWeight: 800, marginBottom: "8px" }}>LogiTrack</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "15px" }}>Ingresá con tu email o Google para acceder a tu espacio.</p>
        </div>

        <div className="clerk-auth-shell" style={{ display: "flex", justifyContent: "center" }}>
          <SignIn
            routing="path"
            path="/login"
            signUpUrl="/sign-up"
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
