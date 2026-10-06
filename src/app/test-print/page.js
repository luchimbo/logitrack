"use client";
import { openPrintWindow, renderPrintWindow } from "@/lib/printLabel";

export default function TestPrintPage() {
    function handlePrint() {
        const win = openPrintWindow();
        if (!win) return;
        renderPrintWindow(win, "/api/labels/test-pdf");
    }

    function handleOpen() {
        window.open("/api/labels/test-pdf", "_blank");
    }

    return (
        <div style={{ padding: "40px", fontFamily: "sans-serif", maxWidth: 480 }}>
            <h1 style={{ fontSize: 22, marginBottom: 8 }}>Test de impresión</h1>
            <p style={{ color: "#666", marginBottom: 32, fontSize: 14 }}>
                Usa los botones para verificar que el flujo Labelary → PDF → impresora funciona correctamente.
                La etiqueta es de prueba y no corresponde a ninguna venta real.
            </p>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button
                    onClick={handlePrint}
                    style={{
                        background: "#2563eb",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "12px 24px",
                        fontSize: 16,
                        cursor: "pointer",
                        fontWeight: 600,
                    }}
                >
                    🖨️ Imprimir etiqueta de prueba
                </button>

                <button
                    onClick={handleOpen}
                    style={{
                        background: "#f1f5f9",
                        color: "#1e293b",
                        border: "1px solid #cbd5e1",
                        borderRadius: 8,
                        padding: "12px 24px",
                        fontSize: 16,
                        cursor: "pointer",
                        fontWeight: 600,
                    }}
                >
                    👁 Solo ver PDF
                </button>
            </div>

            <p style={{ marginTop: 24, fontSize: 12, color: "#94a3b8" }}>
                El botón &quot;Imprimir&quot; abre un popup con el PDF y lanza el diálogo de impresión automáticamente.
                Si el popup queda bloqueado, habilitá popups para este sitio en la barra del navegador.
            </p>
        </div>
    );
}
