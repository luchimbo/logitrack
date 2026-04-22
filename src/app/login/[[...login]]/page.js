"use client";

import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import GeoModiLogo from "@/components/GeoModiLogo";

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
          <GeoModiLogo size="lg" centered />
          <p style={{ color: "var(--text-muted)", fontSize: "15px", marginTop: "10px" }}>Ingresá con tu email o Google para acceder a tu espacio.</p>
        </div>

        <div className="clerk-auth-shell" style={{ display: "flex", justifyContent: "center" }}>
          <SignIn
            routing="path"
            path="/login"
            signUpUrl="/sign-up"
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
