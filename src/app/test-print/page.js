"use client";
import { toast } from "@/lib/api";
import { openPrintDialog, renderPrintDialog } from "@/lib/printLabel";

export default function TestPrintPage() {
    async function handlePrint() {
        const panel = openPrintDialog();
        try {
            await renderPrintDialog(panel, "/api/labels/test-pdf");
        } catch (error) {
            if (panel.closed) return;
            panel.close();
            toast(error.message, "error");
        }
    }

    return (
        <div style={{ padding: "40px", maxWidth: 480 }}>
            <h1>Prueba de impresión</h1>
            <p>Abrí el PDF dentro de GeoModi y probá la impresora con una etiqueta de muestra.</p>
            <button type="button" className="btn btn-primary" onClick={handlePrint}>
                Ver etiqueta de prueba
            </button>
        </div>
    );
}
