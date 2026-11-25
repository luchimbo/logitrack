"use client";

import { useState, useEffect } from "react";
import { api, toast } from "@/lib/api";
import { useBatch } from "./BatchContext";
import { formatArgentinaDateTime, getArgentinaDateString } from "@/lib/dateUtils";
import LoadingButton from "./LoadingButton";
import SectionTitle from "./SectionTitle";
import { getPickingAccessories } from "@/lib/pickingAccessories";
import { renderPickingPdf } from "@/lib/pickingPdf";

export default function PickingList() {
    const { getTodayQueryString } = useBatch();
    const [pickingList, setPickingList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [error, setError] = useState(null);

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
    }, [getTodayQueryString]);

    if (loading && !pickingList.length) {
        return (
            <div className="section active">
                <div className="section-header">
                    <SectionTitle icon="picking">Picking</SectionTitle>
                </div>
                <div className="spinner"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="section active">
                <div className="section-header"><SectionTitle icon="picking">Picking</SectionTitle></div>
                <p style={{ color: "var(--danger)" }}>Error: {error}</p>
            </div>
        );
    }

    if (!pickingList.length) {
        return (
            <div className="section active">
                <div className="section-header">
                    <SectionTitle icon="picking">Picking</SectionTitle>
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
        setIsExportingPdf(true);
        try {
            const { jsPDF } = await import("jspdf");
            const pdf = new jsPDF({ unit: "mm", format: "a4" });
            renderPickingPdf(pdf, { items: pickingList, generatedAt: formatArgentinaDateTime(new Date()) });

            pdf.save(`picking-list-${getArgentinaDateString()}.pdf`);
            toast('PDF generado correctamente', 'success');
        } catch (err) {
            console.error(err);
            toast('Error al generar el PDF', 'error');
        } finally {
            setIsExportingPdf(false);
        }
    };

    const renderItem = (item, idx) => {
        const pendingShipments = item.statuses.filter((status) => status === 'pendiente').length;
        return (
            <div key={idx} className={`picking-item ${item.total_quantity >= 6 ? 'picking-item-priority' : ''}`}>
                <div className="picking-qty">
                    <span>{item.total_quantity}</span>
                    <small>uds</small>
                </div>
                <div className="picking-info">
                    <div className="picking-name">{item.product_name}</div>
                    <div className="picking-sku">
                        <strong>{item.sku ? `SKU ${item.sku}` : 'Sin SKU'}</strong>
                        {item.color && <span>{item.color}</span>}
                        <span>{item.shipment_count} envío{item.shipment_count > 1 ? 's' : ''}</span>
                    </div>
                    {getPickingAccessories(item).map((accessory, index) => (
                        <div key={index} className="picking-accessory">+ {accessory}</div>
                    ))}
                    <p className="picking-progress">{pendingShipments} de {item.shipment_count} envíos pendientes</p>
                </div>
            </div>
        );
    };

    const renderSection = (title, type, items, units) => {
        if (!items.length) return null;

        return (
            <details className={`picking-group picking-group-${type} info-disclosure`}>
                <summary className="picking-group-header info-disclosure-summary">
                    <div>
                        <h2>{title}</h2>
                        <p>{items.length} productos · {units} unidades</p>
                    </div>
                    <span className="info-disclosure-indicator" aria-hidden="true" />
                </summary>
                <div className="picking-items">
                    {items.map((item, i) => renderItem(item, type === 'colecta' ? i : colectaItems.length + i))}
                </div>
            </details>
        );
    };

    return (
        <div className="section active picking-section">
            <div className="picking-hero">
                <div>
                    <SectionTitle icon="picking">Picking</SectionTitle>
                    <p className="section-subtitle">Productos agrupados por método de envío.</p>
                </div>
                <LoadingButton isLoading={isExportingPdf} spinnerSize="md" className="btn btn-primary" onClick={handleExportPdf}>
                    Exportar PDF
                </LoadingButton>
            </div>

            <div className="picking-metrics" aria-label="Resumen de picking">
                <div className="picking-metric picking-metric-primary">
                    <span>{totalUnits}</span>
                    <p>unidades totales</p>
                </div>
                <div className="picking-metric">
                    <span>{totalProducts}</span>
                    <p>productos</p>
                </div>
                <div className="picking-metric picking-metric-colecta">
                    <span>{colectaUnits}</span>
                    <p>uds colecta · {colectaItems.length} prod.</p>
                </div>
                <div className="picking-metric picking-metric-flex">
                    <span>{flexUnits}</span>
                    <p>uds flex · {flexItems.length} prod.</p>
                </div>
            </div>

            <div className="picking-layout">
                <section className="picking-main" aria-label="Productos para picking">
                    {renderSection('Colecta', 'colecta', colectaItems, colectaUnits)}
                    {renderSection('Flex', 'flex', flexItems, flexUnits)}
                </section>
            </div>
        </div>
    );
}
