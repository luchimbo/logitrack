"use client";

import { useState, useEffect, useRef } from "react";
import { api, toast } from "@/lib/api";
import LoadingButton from "./LoadingButton";
import SectionTitle from "./SectionTitle";
import { getPickingAccessories } from "@/lib/pickingAccessories";
import { renderPickingPdf } from "@/lib/pickingPdf";

export default function PickingList({ visible = true }) {
    const [data, setData] = useState(null);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [error, setError] = useState(null);
    const [refresh, setRefresh] = useState(0);
    const poll = useRef(null);
    const exporting = useRef(false);

    useEffect(() => {
        if (!visible) return;
        let timer;
        let stopped = false;
        async function fetchData() {
            const controller = new AbortController();
            poll.current = controller;
            try {
                if (!exporting.current && !document.hidden) {
                    const result = await api("/picking-list", { signal: controller.signal });
                    if (!controller.signal.aborted) {
                        setData(result);
                        setError(null);
                    }
                }
            } catch (err) {
                if (!controller.signal.aborted) setError(err.message);
            } finally {
                if (!stopped) timer = setTimeout(fetchData, 60_000);
            }
        }
        fetchData();
        return () => {
            stopped = true;
            clearTimeout(timer);
            poll.current?.abort();
        };
    }, [refresh, visible]);

    if (!data && !error) {
        return (
            <div className="section active">
                <div className="section-header">
                    <SectionTitle icon="picking">Picking</SectionTitle>
                </div>
                <div className="spinner"></div>
            </div>
        );
    }

    const pickingList = data?.items || [];
    const failedAccounts = data?.failedAccounts || [];
    const consultedAccounts = (data?.connectedAccounts || 0) - failedAccounts.length;
    const packageCount = data?.packageCount || 0;
    const colectaItems = pickingList.filter(p => p.shipping_method === 'colecta');
    const flexItems = pickingList.filter(p => p.shipping_method === 'flex');
    const totalProducts = pickingList.length;
    const totalUnits = pickingList.reduce((sum, p) => sum + p.total_quantity, 0);
    const colectaUnits = colectaItems.reduce((sum, p) => sum + p.total_quantity, 0);
    const flexUnits = flexItems.reduce((sum, p) => sum + p.total_quantity, 0);

    const handleExportPdf = async (savedExport) => {
        if (exporting.current) return;
        exporting.current = true;
        poll.current?.abort();
        setIsExportingPdf(true);
        try {
            const { jsPDF } = await import("jspdf");
            let snapshot = savedExport;
            if (!snapshot) {
                const result = await api("/picking-list", { method: "POST" });
                setData(result);
                setError(null);
                if (result.failedAccounts.length) return;
                if (!result.created) {
                    toast("Ya no quedan paquetes pendientes para exportar.");
                    return;
                }
                snapshot = result.lastExport;
            }
            const pdf = new jsPDF({ unit: "mm", format: "a4" });
            renderPickingPdf(pdf, snapshot);
            const kind = snapshot.supplemental ? "adicional" : "inicial";
            pdf.save(`picking-${kind}-${snapshot.date}-${snapshot.id}.pdf`);
        } catch (err) {
            console.error(err);
            toast(err.message || "No pudimos descargar el PDF. Volvé a intentar.", "error");
        } finally {
            exporting.current = false;
            setIsExportingPdf(false);
        }
    };

    const renderItem = (item) => {
        return (
            <div key={item.key} className={`picking-item ${item.total_quantity >= 6 ? 'picking-item-priority' : ''}`}>
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
                    {items.map(renderItem)}
                </div>
            </details>
        );
    };

    return (
        <div className="section active picking-section">
            <div className="picking-hero">
                <div>
                    <SectionTitle icon="picking">Picking</SectionTitle>
                    <p className="section-subtitle">
                        {consultedAccounts
                            ? `Mercado Libre · ${consultedAccounts} ${consultedAccounts === 1 ? "cuenta consultada" : "cuentas consultadas"}`
                            : "Paquetes pendientes de preparación en Mercado Libre."}
                    </p>
                </div>
                <div className="picking-actions">
                    <button type="button" className="btn" disabled={isExportingPdf} onClick={() => setRefresh((value) => value + 1)}>
                        Actualizar
                    </button>
                    <LoadingButton isLoading={isExportingPdf} disabled={!packageCount || Boolean(error) || Boolean(failedAccounts.length)} spinnerSize="md" className="btn btn-primary" onClick={() => handleExportPdf()}>
                        {data?.supplemental ? "Exportar PDF adicional" : "Exportar PDF inicial"}
                    </LoadingButton>
                </div>
            </div>

            <div className="picking-export-status">
                <div aria-live="polite">
                    {error && <p role="alert">{error}</p>}
                    {failedAccounts.length > 0 && (
                        <p role="alert">No pudimos consultar {failedAccounts.join(", ")}. Actualizá para exportar el listado completo.</p>
                    )}
                    {packageCount > 0 && (
                        <p>
                            {packageCount === 1 ? "1 paquete" : `${packageCount} paquetes`}
                            {data.supplemental ? " para el PDF adicional." : " por exportar."}
                        </p>
                    )}
                    {data && !failedAccounts.length && !packageCount && !error && (
                        <p>{data.connectedAccounts ? "No hay paquetes pendientes de exportar." : "Conectá una cuenta de Mercado Libre para ver sus paquetes."}</p>
                    )}
                </div>
                {data?.lastExport && (
                    <button type="button" className="btn btn-ghost btn-sm" disabled={isExportingPdf} onClick={() => handleExportPdf(data.lastExport)}>
                        Descargar último PDF
                    </button>
                )}
            </div>

            {pickingList.length > 0 && (
                <>
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
                </>
            )}
        </div>
    );
}
