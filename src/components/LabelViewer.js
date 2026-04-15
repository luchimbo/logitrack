"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { api, toast } from "@/lib/api";

export default function LabelViewer({ shipmentId, onClose }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [imageUrl, setImageUrl] = useState(null);

    const loadLabel = useCallback(async () => {
        if (!shipmentId) return;
        setLoading(true);
        setError(null);
        setImageUrl(null);
        try {
            const url = `/api/labels/preview?shipmentId=${encodeURIComponent(shipmentId)}`;
            const response = await fetch(url);
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || "Error al cargar la etiqueta");
            }
            const blob = await response.blob();
            setImageUrl(URL.createObjectURL(blob));
        } catch (err) {
            setError(err.message);
            toast(err.message, "error");
        } finally {
            setLoading(false);
        }
    }, [shipmentId]);

    useEffect(() => {
        loadLabel();
        return () => {
            if (imageUrl) {
                URL.revokeObjectURL(imageUrl);
            }
        };
    }, [loadLabel]);

    useEffect(() => {
        if (!shipmentId) return;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [shipmentId]);

    const handleDownload = async () => {
        if (!shipmentId) return;
        try {
            const response = await fetch(`/api/shipments/${shipmentId}/label`);
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || "Error al descargar");
            }
            const zpl = await response.text();
            const blob = new Blob([zpl], { type: "application/x-www-form-urlencoded" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `etiqueta-${shipmentId}.zpl`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast("Etiqueta descargada", "success");
        } catch (err) {
            toast(err.message, "error");
        }
    };

    const handlePrint = () => {
        if (!imageUrl) return;
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
            toast("No se pudo abrir la ventana de impresión", "error");
            return;
        }
        printWindow.document.write(`
            <html>
                <head><title>Etiqueta ${shipmentId}</title></head>
                <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;">
                    <img src="${imageUrl}" style="max-width:100%;max-height:100%;" onload="window.print();" />
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    if (!shipmentId) return null;

    return createPortal(
        <div className="label-modal-overlay" onClick={onClose}>
            <div className="label-modal" onClick={(e) => e.stopPropagation()}>
                <div className="label-modal-header">
                    <h3>Vista previa de etiqueta</h3>
                    <button className="label-modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="label-modal-body">
                    {loading && (
                        <div className="label-modal-loading">
                            <div className="spinner" style={{ width: "40px", height: "40px" }}></div>
                            <p>Cargando etiqueta...</p>
                        </div>
                    )}
                    {error && !loading && (
                        <div className="label-modal-error">
                            <p>{error}</p>
                            <button className="btn btn-primary btn-sm" onClick={loadLabel}>Reintentar</button>
                        </div>
                    )}
                    {!loading && !error && imageUrl && (
                        <img src={imageUrl} alt="Etiqueta" className="label-modal-image" />
                    )}
                </div>
                <div className="label-modal-footer">
                    <button className="btn btn-ghost btn-sm" onClick={onClose}>Cerrar</button>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <button className="btn btn-sm" onClick={handleDownload} disabled={!imageUrl}>
                            Descargar ZPL
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={handlePrint} disabled={!imageUrl}>
                            Imprimir
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
