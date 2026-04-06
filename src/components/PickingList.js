"use client";

import { useState, useEffect } from "react";
import { api, toast } from "@/lib/api";
import { useBatch } from "./BatchContext";
import { useIsMobile } from "@/hooks/useMediaQuery";

export default function PickingList() {
    const { getTodayQueryString } = useBatch();
    const [pickingList, setPickingList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const isMobile = useIsMobile();

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            setError(null);
            try {
                const qs = getTodayQueryString();
                const data = await api(`/picking-list?${qs}`);
                data.sort((a, b) => {
                    const aComplete = a.statuses.every(s => s !== 'pendiente');
                    const bComplete = b.statuses.every(s => s !== 'pendiente');
                    if (aComplete !== bComplete) return aComplete ? 1 : -1;
                    return b.total_quantity - a.total_quantity;
                });
                setPickingList(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    if (loading && !pickingList.length) {
        return (
            <div className="section active">
                <div className="section-header">
                    <h1 className="section-title">📋 Lista de Picking</h1>
                </div>
                <div className="spinner"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="section active">
                <div className="section-header"><h1 className="section-title">📋 Lista de Picking</h1></div>
                <p style={{ color: "var(--danger)" }}>Error: {error}</p>
            </div>
        );
    }

    if (!pickingList.length) {
        return (
            <div className="section active">
                <div className="section-header">
                    <h1 className="section-title">📋 Lista de Picking</h1>
                    <p className="section-subtitle">Productos a buscar — divididos por método de envío</p>
                </div>
                <div className="empty-state">
                    <div className="empty-state-icon">📦</div>
                    <p className="empty-state-text">No hay productos para buscar.<br />Subí etiquetas primero.</p>
                </div>
            </div>
        );
    }

    const colectaItems = pickingList.filter(p => p.shipping_method === 'colecta');
    const flexItems = pickingList.filter(p => p.shipping_method === 'flex');
    const totalProducts = pickingList.length;
    const totalUnits = pickingList.reduce((sum, p) => sum + p.total_quantity, 0);
    const colectaUnits = colectaItems.reduce((sum, p) => sum + p.total_quantity, 0);
    const flexUnits = flexItems.reduce((sum, p) => sum + p.total_quantity, 0);

    const handleExportPdf = async () => {
        try {
            const { jsPDF } = await import("jspdf");
            const pdf = new jsPDF({ unit: "mm", format: "a4" });
            const pageHeight = pdf.internal.pageSize.getHeight();
            const pageWidth = pdf.internal.pageSize.getWidth();
            const margin = 14;
            const contentWidth = pageWidth - (margin * 2);
            let y = 18;

            const addPageIfNeeded = (requiredHeight = 10) => {
                if (y + requiredHeight > pageHeight - 14) {
                    pdf.addPage();
                    y = 18;
                }
            };

            const writeSectionTitle = (title, color) => {
                addPageIfNeeded(12);
                pdf.setFillColor(color[0], color[1], color[2]);
                pdf.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F');
                pdf.setTextColor(255, 255, 255);
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(13);
                pdf.text(title, margin + 4, y + 6.5);
                y += 14;
            };

            const writeItem = (item) => {
                const blockHeight = 17;
                addPageIfNeeded(blockHeight);

                pdf.setDrawColor(225, 232, 240);
                pdf.roundedRect(margin, y, contentWidth, blockHeight - 2, 2, 2);

                pdf.setFillColor(99, 102, 241);
                pdf.roundedRect(margin + 3, y + 3, 10, 10, 2, 2, 'F');
                pdf.setTextColor(255, 255, 255);
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(11);
                pdf.text(String(item.total_quantity), margin + 8, y + 9.8, { align: "center" });

                pdf.setTextColor(20, 24, 35);
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(10.5);
                const titleLines = pdf.splitTextToSize(item.product_name || "Producto sin nombre", contentWidth - 26);
                pdf.text(titleLines.slice(0, 2), margin + 17, y + 7);

                pdf.setTextColor(90, 99, 116);
                pdf.setFont("helvetica", "normal");
                pdf.setFontSize(8.5);
                const detail = `SKU: ${item.sku || 'N/A'}${item.color ? ` · ${item.color}` : ''} · ${item.shipment_count} envío${item.shipment_count > 1 ? 's' : ''}`;
                const detailLines = pdf.splitTextToSize(detail, contentWidth - 26);
                pdf.text(detailLines.slice(0, 1), margin + 17, y + 12.5);
                y += blockHeight + 2;
            };

            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(18);
            pdf.setTextColor(20, 24, 35);
            pdf.text("Lista de Picking", margin, y);
            y += 7;

            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(10);
            pdf.setTextColor(90, 99, 116);
            pdf.text(`Generado: ${new Date().toLocaleString("es-AR")}`, margin, y);
            y += 8;

            pdf.setDrawColor(225, 232, 240);
            pdf.line(margin, y, pageWidth - margin, y);
            y += 8;

            pdf.setFont("helvetica", "bold");
            pdf.setFontSize(11);
            pdf.setTextColor(20, 24, 35);
            pdf.text(`Productos: ${totalProducts}`, margin, y);
            pdf.text(`Unidades: ${totalUnits}`, margin + 45, y);
            pdf.text(`Colecta: ${colectaItems.length} / ${colectaUnits}`, margin + 95, y);
            pdf.text(`Flex: ${flexItems.length} / ${flexUnits}`, margin + 145, y);
            y += 10;

            if (colectaItems.length > 0) {
                writeSectionTitle(`Colecta · ${colectaItems.length} productos · ${colectaUnits} uds`, [245, 158, 11]);
                colectaItems.forEach(writeItem);
            }

            if (flexItems.length > 0) {
                writeSectionTitle(`Flex · ${flexItems.length} productos · ${flexUnits} uds`, [99, 102, 241]);
                flexItems.forEach(writeItem);
            }

            pdf.save(`picking-list-${new Date().toISOString().slice(0, 10)}.pdf`);
            toast('PDF generado correctamente', 'success');
        } catch (err) {
            console.error(err);
            toast('Error al generar el PDF', 'error');
        }
    };

    const renderItem = (item, idx) => {
        return (
            <div key={idx} className={`picking-item`}>
                <div className="picking-qty">{item.total_quantity}</div>
                <div className="picking-info">
                    <div className="picking-name">{item.product_name}</div>
                    <div className="picking-sku">
                        SKU: {item.sku || 'N/A'}{item.color ? ` · ${item.color}` : ''} · {item.shipment_count} envío{item.shipment_count > 1 ? 's' : ''}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="section active">
            <div className="section-header flex-between">
                <div>
                    <h1 className="section-title">📋 Lista de Picking</h1>
                    <p className="section-subtitle">{totalProducts} productos — {totalUnits} unidades ({colectaItems.length} colecta, {flexItems.length} flex)</p>
                </div>
                <button className="btn btn-primary" onClick={handleExportPdf}>
                    📄 Exportar PDF
                </button>
            </div>

            {colectaItems.length > 0 && (
                <div className="card mb-md" style={{ borderLeft: "3px solid #f59e0b" }}>
                    <h3 style={{ marginBottom: "16px", fontSize: "16px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                        📦 Colecta <span className="badge badge-colecta">{colectaItems.length} productos · {colectaUnits} uds</span>
                    </h3>
                    <div>{colectaItems.map((item, i) => renderItem(item, i))}</div>
                </div>
            )}

            {flexItems.length > 0 && (
                <div className="card" style={{ borderLeft: "3px solid var(--accent)" }}>
                    <h3 style={{ marginBottom: "16px", fontSize: "16px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                        🚀 Flex <span className="badge badge-flex">{flexItems.length} productos · {flexUnits} uds</span>
                    </h3>
                    <div>{flexItems.map((item, i) => renderItem(item, colectaItems.length + i))}</div>
                </div>
            )}
        </div>
    );
}
