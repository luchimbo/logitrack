"use client";

import Link from "next/link";
import { SignIn } from "@clerk/nextjs";

const clerkAppearance = {
  variables: {
    colorPrimary: "#818cf8",
    colorText: "#f1f5f9",
    colorTextSecondary: "#94a3b8",
    colorBackground: "#1a1f2e",
    colorInputBackground: "#111827",
    colorInputText: "#f1f5f9",
    colorNeutral: "#94a3b8",
    colorDanger: "#f87171",
    borderRadius: "8px",
  },
  elements: {
    rootBox: { width: "100%" },
    card: {
      width: "100%",
      boxShadow: "none",
      border: "none",
      background: "transparent",
    },
    cardBox: {
      boxShadow: "none",
      border: "none",
      background: "transparent",
    },
    headerTitle: { display: "none" },
    headerSubtitle: { display: "none" },
    socialButtonsBlockButton: {
      minHeight: "46px",
      background: "#111827",
      border: "1px solid rgba(148,163,184,0.12)",
      color: "#f1f5f9",
    },
    socialButtonsBlockButtonText: {
      color: "#f1f5f9",
      fontWeight: 600,
    },
    dividerLine: { background: "rgba(148,163,184,0.12)" },
    dividerText: { color: "#64748b" },
    formFieldLabel: { color: "#94a3b8", fontWeight: 600 },
    formFieldInput: {
      minHeight: "46px",
      background: "#111827",
      border: "1px solid rgba(148,163,184,0.12)",
      color: "#f1f5f9",
      boxShadow: "none",
    },
    formButtonPrimary: {
      minHeight: "46px",
      background: "linear-gradient(135deg, #6366f1, #818cf8)",
      fontWeight: 700,
    },
    footer: {
      background: "transparent",
      borderTop: "1px solid rgba(148,163,184,0.08)",
    },
    footerActionText: { color: "#94a3b8" },
    footerActionLink: { color: "#818cf8" },
    identityPreviewText: { color: "#f1f5f9" },
    formResendCodeLink: { color: "#818cf8" },
    otpCodeFieldInput: {
      background: "#111827",
      border: "1px solid rgba(148,163,184,0.12)",
      color: "#f1f5f9",
    },
  },
};

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

        <div className="card" style={{ padding: "20px" }}>
          <SignIn
            routing="path"
            path="/login"
            signUpUrl="/sign-up"
            fallbackRedirectUrl="/"
            forceRedirectUrl="/"
            appearance={clerkAppearance}
          />
        </div>

        <div style={{ textAlign: "center", marginTop: "16px" }}>
          <Link href="/admin-login" style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            Ingresar como admin local
          </Link>
        </div>
      </div>
    </div>
  );
}
