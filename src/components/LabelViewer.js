"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { toast } from "@/lib/api";
import { openPrintWindow, renderPrintWindow } from "@/lib/printLabel";

export default function LabelViewer({ shipmentId, onClose }) {
    const dialogRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [imageUrl, setImageUrl] = useState(null);
    const [printing] = useState(false);

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
    }, [loadLabel]);

    useEffect(() => {
        return () => {
            if (imageUrl) {
                URL.revokeObjectURL(imageUrl);
            }
        };
    }, [imageUrl]);

    useEffect(() => {
        if (!shipmentId) return;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const previousFocus = document.activeElement;
        const dialog = dialogRef.current;
        dialog?.focus();
        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                onClose();
                return;
            }
            if (event.key !== "Tab" || !dialog) return;
            const focusable = [...dialog.querySelectorAll("button:not([disabled]),a[href],[tabindex]:not([tabindex='-1'])")];
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.body.style.overflow = originalOverflow;
            document.removeEventListener("keydown", handleKeyDown);
            if (previousFocus instanceof HTMLElement) previousFocus.focus();
        };
    }, [onClose, shipmentId]);

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
        if (!shipmentId) return;
        const win = openPrintWindow();
        if (!win) return;
        renderPrintWindow(win, `/api/labels/pdf?shipmentId=${encodeURIComponent(shipmentId)}`);
    };

    const handlePreviewPrint = () => {
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
        <div className="label-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <div ref={dialogRef} className="label-modal" role="dialog" aria-modal="true" aria-labelledby="label-modal-title" tabIndex={-1}>
                <div className="label-modal-header">
                    <h3 id="label-modal-title">Vista previa de etiqueta</h3>
                    <button className="label-modal-close" onClick={onClose} aria-label="Cerrar vista previa">×</button>
                </div>
                <div className="label-modal-body">
                    {loading && (
                        <div className="label-modal-loading" role="status" aria-live="polite">
                            <div className="spinner" style={{ width: "40px", height: "40px" }}></div>
                            <p>Cargando etiqueta...</p>
                        </div>
                    )}
                    {error && !loading && (
                        <div className="label-modal-error" role="alert">
                            <p>{error}</p>
                            <button className="btn btn-primary btn-sm" onClick={loadLabel}>Reintentar</button>
                        </div>
                    )}
                    {!loading && !error && imageUrl && (
                        <Image src={imageUrl} alt="Etiqueta" className="label-modal-image" width={1200} height={1800} unoptimized />
                    )}
                </div>
                <div className="label-modal-footer">
                    <button className="btn btn-ghost btn-sm" onClick={onClose}>Cerrar</button>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <button className="btn btn-sm" onClick={handleDownload} disabled={!imageUrl}>
                            Descargar ZPL
                        </button>
                        <button className="btn btn-sm" onClick={handlePreviewPrint} disabled={!imageUrl}>
                            Imprimir vista
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={handlePrint} disabled={printing || !shipmentId}>
                            Imprimir
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
