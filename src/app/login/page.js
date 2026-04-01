"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Error al iniciar sesión");
            }

            window.location.href = "/";
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            background: "var(--bg-secondary)",
            padding: "0",
            width: "100vw",
            margin: "0",
            position: "fixed",
            inset: "0"
        }}>
            <div style={{
                width: "100%",
                height: "100%",
                maxWidth: "420px",
                padding: "40px 24px",
                background: "var(--surface)",
                borderRadius: "0",
                boxShadow: "none",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                margin: "0 auto"
            }}>
                <div style={{ marginBottom: "40px" }}>
                    <div style={{ fontSize: "56px", marginBottom: "16px" }}>📦</div>
                    <h1 style={{ fontSize: "32px", color: "var(--text)", fontWeight: 800, margin: 0 }}>LogiTrack</h1>
                    <p style={{ color: "var(--text-muted)", fontSize: "16px", marginTop: "8px" }}>Inicia sesión para continuar</p>
                </div>

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px", textAlign: "left", width: "100%" }}>
                    {error && (
                        <div style={{ background: "var(--danger-bg)", color: "var(--danger)", padding: "12px", borderRadius: "8px", fontSize: "14px", fontWeight: 600 }}>
                            ⚠️ {error}
                        </div>
                    )}

                    <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>USUARIO</label>
                        <input
                            type="text"
                            required
                            className="form-input"
                            style={{ width: "100%" }}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Ej: admin"
                            autoComplete="username"
                        />
                    </div>

                    <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>CONTRASEÑA</label>
                        <input
                            type="password"
                            required
                            className="form-input"
                            style={{ width: "100%" }}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="current-password"
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ height: "48px", marginTop: "8px", fontWeight: 600, fontSize: "16px", width: "100%" }}
                        disabled={loading}
                    >
                        {loading ? "Iniciando sesión..." : "Ingresar a LogiTrack"}
                    </button>

                    <p style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center", marginTop: "16px" }}>
                        🔐 Acceso restringido.
                    </p>
                </form>
            </div>
        </div>
    );
}
