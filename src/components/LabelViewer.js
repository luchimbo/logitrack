"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { toast } from "@/lib/api";
import { chooseLabelPrintFormat, downloadLabelZplFile, openPrintDialog, renderPrintDialog } from "@/lib/printLabel";

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
            if (document.querySelector(".label-print-dialog[open]")) return;
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

    const handlePrint = async () => {
        if (!shipmentId) return;
        const win = openPrintDialog();
        if (!win) return;
        try {
            const format = await chooseLabelPrintFormat(win);
            if (format === "pdf" || format === "thermal") {
                await renderPrintDialog(win, `/api/labels/pdf?layout=${format === "pdf" ? "a4" : "thermal"}&shipmentId=${encodeURIComponent(shipmentId)}`);
            } else if (format === "zpl") {
                await downloadLabelZplFile("/api/shipments/labels", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids: [shipmentId] }),
                }, win.signal);
                win.close();
            }
        } catch (err) {
            if (win.closed) return;
            win.close();
            toast(err.message, "error");
        }
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
