"use client";

import { useState, useEffect } from "react";
import { api, toast } from "@/lib/api";
import { useBatch } from "./BatchContext";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useShipmentLabelDownloads } from "@/hooks/useShipmentLabelDownloads";
import { useShipmentSelection } from "@/hooks/useShipmentSelection";
import LabelViewer from "./LabelViewer";
import LoadingButton from "./LoadingButton";

export default function ColectaSection() {
    const { getTodayQueryString } = useBatch();
    const [shipments, setShipments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [viewingLabelId, setViewingLabelId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const { selectedShipmentIds, toggleShipmentSelection, toggleItemsSelection, clearSelection, removeSelectedIds, getSelectedIdsFrom, areAllSelected } = useShipmentSelection();
    const { downloadingId, isDownloadingBulk, handleDownloadLabel, handleBulkDownloadLabels: downloadSelectedLabels } = useShipmentLabelDownloads();
    const isMobile = useIsMobile();

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            setError(null);
            try {
                const qs = getTodayQueryString('shipping_method=colecta');
                const data = await api(`/shipments?${qs}`);
                setShipments(Array.isArray(data) ? data : []);
                clearSelection();
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [getTodayQueryString, clearSelection]);


    const handleDeleteShipment = async (id) => {
        const ok = window.confirm(`¿Eliminar el envío #${id}? Esta acción no se puede deshacer.`);
        if (!ok) return;

        setDeletingId(id);
        try {
            await api(`/shipments/${id}`, { method: 'DELETE' });
            setShipments(prev => prev.filter(s => s.id !== id));
            removeSelectedIds(id);
            toast(`Envío #${id} eliminado`, 'success');
        } catch (err) {
            toast('Error eliminando envío', 'error');
        } finally {
            setDeletingId(null);
        }
    };

    const toggleSelectAll = () => {
        toggleItemsSelection(shipments);
    };

    const handleBulkDownloadLabels = async () => {
        await downloadSelectedLabels(getSelectedIdsFrom(shipments));
    };

    if (loading && !shipments.length) {
        return (
            <div className="section active">
                <div className="section-header"><h1 className="section-title">📦 Colecta</h1></div>
                <div className="spinner"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="section active">
                <div className="section-header"><h1 className="section-title">📦 Colecta</h1></div>
                <p style={{ color: "var(--danger)" }}>Error: {error}</p>
            </div>
        );
    }

    if (!shipments.length) {
        return (
            <div className="section active">
                <div className="section-header">
                    <h1 className="section-title">📦 Colecta</h1>
                    <p className="section-subtitle">Envíos para colecta tradicional</p>
                </div>
                <div className="empty-state">
                    <div className="empty-state-icon">📦</div>
                    <p className="empty-state-text">Sin envíos de colecta.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="section active">
            <div className="section-header flex-between">
                <div>
                    <h1 className="section-title">📦 Colecta</h1>
                    <p className="section-subtitle">{shipments.length} envíos de colecta</p>
                </div>
            </div>

            <div className="stats-grid">
                <div className="stat-card card accent"><div className="stat-value">{shipments.length}</div><div className="stat-label">Total Colecta</div></div>
            </div>

            <div className="card" style={{ marginBottom: '16px', padding: '14px 16px', background: 'var(--bg-secondary)' }}>
                <div className="flex-between" style={{ gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                        {selectedShipmentIds.length > 0 ? `${selectedShipmentIds.length} envíos seleccionados` : 'Seleccioná etiquetas para descargar varias en un ZPL'}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={toggleSelectAll}>
                            {areAllSelected(shipments) ? 'Deseleccionar todo' : 'Seleccionar todo'}
                        </button>
                        <LoadingButton isLoading={isDownloadingBulk} className="btn btn-sm" disabled={!selectedShipmentIds.length} onClick={handleBulkDownloadLabels} style={{ background: 'var(--info-bg)', color: 'var(--info)', border: '1px solid var(--info)' }}>
                            Descargar seleccionadas
                        </LoadingButton>
                    </div>
                </div>
            </div>

            <div className="card">
                {/* Desktop Table */}
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th style={{ width: '42px' }}>
                                    <input type="checkbox" checked={areAllSelected(shipments)} onChange={toggleSelectAll} aria-label="Seleccionar todas las etiquetas de colecta" />
                                </th>
                                <th>Producto</th>
                                <th>Destinatario</th>
                                <th>Ciudad</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shipments.map(s => (
                                <tr key={s.id}>
                                    <td>
                                        <input type="checkbox" checked={selectedShipmentIds.includes(s.id)} onChange={() => toggleShipmentSelection(s.id)} aria-label={`Seleccionar etiqueta ${s.id}`} />
                                    </td>
                                    <td style={{ fontWeight: 600 }}>{s.product_name}</td>
                                    <td>{s.recipient_name || 'N/A'}</td>
                                    <td>{s.city || 'N/A'}, {s.province || ''}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <button
                                                className="btn btn-sm"
                                                onClick={() => setViewingLabelId(s.id)}
                                                style={{ background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                                            >
                                                Ver etiqueta
                                            </button>
                                            <LoadingButton
                                                isLoading={downloadingId === s.id}
                                                className="btn btn-sm"
                                                onClick={() => handleDownloadLabel(s.id)}
                                                style={{ background: 'var(--info-bg)', color: 'var(--info)', border: '1px solid var(--info)' }}
                                            >
                                                Descargar
                                            </LoadingButton>
                                            <LoadingButton
                                                isLoading={deletingId === s.id}
                                                className="btn btn-sm"
                                                style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
                                                onClick={() => handleDeleteShipment(s.id)}
                                            >
                                                🗑️ Eliminar
                                            </LoadingButton>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Cards */}
                <div className="mobile-cards-container">
                    {shipments.map(s => (
                        <div key={s.id} className="mobile-card">
                            <div className="mobile-card-header">
                                <input type="checkbox" checked={selectedShipmentIds.includes(s.id)} onChange={() => toggleShipmentSelection(s.id)} aria-label={`Seleccionar etiqueta ${s.id}`} />
                                <div className="mobile-card-title">{s.product_name}</div>
                            </div>
                            <div className="mobile-card-body">
                                <div className="mobile-card-row">
                                    <span className="mobile-card-label">Destinatario</span>
                                    <span className="mobile-card-value">{s.recipient_name || 'N/A'}</span>
                                </div>
                                <div className="mobile-card-row">
                                    <span className="mobile-card-label">Ciudad</span>
                                    <span className="mobile-card-value">{s.city || 'N/A'}, {s.province || ''}</span>
                                </div>
                            </div>
                            <div className="mobile-card-actions">
                                <button
                                    className="btn btn-sm"
                                    onClick={() => setViewingLabelId(s.id)}
                                    style={{ background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                                >
                                    Ver
                                </button>
                                <LoadingButton
                                    isLoading={downloadingId === s.id}
                                    className="btn btn-sm"
                                    onClick={() => handleDownloadLabel(s.id)}
                                    style={{ background: 'var(--info-bg)', color: 'var(--info)', border: '1px solid var(--info)' }}
                                >
                                    Descargar
                                </LoadingButton>
                                <LoadingButton
                                    isLoading={deletingId === s.id}
                                    className="btn btn-sm"
                                    style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
                                    onClick={() => handleDeleteShipment(s.id)}
                                >
                                    🗑️
                                </LoadingButton>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <LabelViewer shipmentId={viewingLabelId} onClose={() => setViewingLabelId(null)} />
        </div>
    );
}
