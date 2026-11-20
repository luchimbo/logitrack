"use client";

import InfoDisclosure from "./InfoDisclosure";
import { chooseLabelPrintFormat, downloadLabelZplFile, openPrintDialog, renderPrintDialog } from "@/lib/printLabel";

import { useState, useEffect, useMemo } from "react";
import { api, toast } from "@/lib/api";
import { useBatch } from "./BatchContext";
import { useShipmentLabelDownloads } from "@/hooks/useShipmentLabelDownloads";
import { useShipmentSelection } from "@/hooks/useShipmentSelection";
import { resolveAtoRemitentes, accountForShipment } from "@/lib/accountDetection";
import LabelViewer from "./LabelViewer";
import LoadingButton from "./LoadingButton";
import MercadoLibreShipmentMeta from "./MercadoLibreShipmentMeta";
import MobileSelectionBar from "./MobileSelectionBar";
import SectionTitle from "./SectionTitle";
import EmptyGuide from "./EmptyGuide";
import { EMPTY_STATES, loadFailure } from "@/lib/emptyStates";

export default function ColectaSection({ onNavigate }) {
    const { getTodayQueryString, reloadBatches } = useBatch();
    const [allShipments, setAllShipments] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [viewingLabelId, setViewingLabelId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [isDeletingBulk, setIsDeletingBulk] = useState(false);
    const [isPrintingBulk, setIsPrintingBulk] = useState(false);
    const { selectedShipmentIds, toggleShipmentSelection, toggleItemsSelection, clearSelection, removeSelectedIds, getSelectedIdsFrom, areAllSelected } = useShipmentSelection();
    const { downloadingId, isDownloadingBulk, handleDownloadLabel, handleBulkDownloadLabels: downloadSelectedLabels } = useShipmentLabelDownloads();

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            setError(null);
            try {
                const qs = getTodayQueryString('shipping_method=colecta');
                const data = await api(`/shipments?${qs}`);
                setAllShipments(Array.isArray(data) ? data : []);
                clearSelection();
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [getTodayQueryString, clearSelection, reloadKey]);

    // Deduce which sender (remitente) belongs to ATO (the account that ships
    // Arturia products); every other sender is PCM. See lib/accountDetection.js.
    const atoRemitentes = useMemo(() => resolveAtoRemitentes(allShipments), [allShipments]);
    const accountOf = (shipment) => accountForShipment(shipment, atoRemitentes);

    // Accounts actually present in the current dataset, used for the selector.
    const availableAccounts = useMemo(() => {
        const set = new Set(allShipments.map((s) => accountForShipment(s, atoRemitentes)));
        return [...set];
    }, [allShipments, atoRemitentes]);
    const showAccountColumn = availableAccounts.length > 1;

    const shipments = useMemo(() => (
        selectedAccount
            ? allShipments.filter((s) => accountForShipment(s, atoRemitentes) === selectedAccount)
            : allShipments
    ), [allShipments, atoRemitentes, selectedAccount]);


    const handleDeleteShipment = async (id) => {
        const ok = window.confirm(`¿Eliminar el envío #${id}? Esta acción no se puede deshacer.`);
        if (!ok) return;

        setDeletingId(id);
        try {
            await api(`/shipments/${id}`, { method: 'DELETE' });
            setAllShipments(prev => prev.filter(s => s.id !== id));
            removeSelectedIds(id);
            await reloadBatches();
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

    const handleBulkPrintLabels = async () => {
        const selectedIds = getSelectedIdsFrom(shipments);
        if (!selectedIds.length) return;

        const win = openPrintDialog();
        if (!win) return;
        setIsPrintingBulk(true);
        try {
            const format = await chooseLabelPrintFormat(win);
            if (format === "pdf" || format === "thermal") {
                await renderPrintDialog(win, `/api/labels/pdf?layout=${format === "pdf" ? "a4" : "thermal"}&ids=${encodeURIComponent(selectedIds.join(','))}`);
            } else if (format === "zpl") {
                await downloadLabelZplFile("/api/shipments/labels", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids: selectedIds }),
                }, win.signal);
                win.close();
            }
        } catch (err) {
            if (win.closed) return;
            win.close();
            toast(err.message || 'No se pudo preparar la impresión', 'error');
        } finally {
            setIsPrintingBulk(false);
        }
    };

    const handleBulkDelete = async () => {
        const selectedIds = getSelectedIdsFrom(shipments);
        if (!selectedIds.length) return;
        if (!confirm(`Eliminar ${selectedIds.length} envios seleccionados? Esta accion no se puede deshacer.`)) return;

        setIsDeletingBulk(true);
        try {
            const result = await api('/shipments/bulk', {
                method: 'DELETE',
                body: JSON.stringify({ ids: selectedIds }),
            });
            setAllShipments((prev) => prev.filter((shipment) => !selectedIds.includes(shipment.id)));
            removeSelectedIds(selectedIds);
            await reloadBatches();
            toast(`${result.deleted || 0} envios eliminados`, 'success');
        } catch (err) {
            toast('Error eliminando envios seleccionados', 'error');
        } finally {
            setIsDeletingBulk(false);
        }
    };

    const selectedVisibleIds = getSelectedIdsFrom(shipments);
    const selectedVisibleCount = selectedVisibleIds.length;

    const renderProductMeta = (shipment) => (
        <div style={{ display: 'grid', gap: '4px' }}>
            <span>{shipment.product_name}</span>
            <MercadoLibreShipmentMeta shipment={shipment} compact />
        </div>
    );

    const accountSelector = showAccountColumn ? (
        <select
            className="btn btn-ghost btn-sm"
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            aria-label="Filtrar colecta por cuenta"
        >
            <option value="">Todas las cuentas</option>
            {availableAccounts.map((account) => (
                <option key={account} value={account}>{account}</option>
            ))}
        </select>
    ) : null;

    if (loading && !shipments.length) {
        return (
            <div className="section active">
                <div className="section-header"><SectionTitle icon="colecta">Colecta</SectionTitle></div>
                <div className="spinner"></div>
                <p className="empty-state-text" role="status">Cargando colecta…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="section active">
                <div className="section-header"><SectionTitle icon="colecta">Colecta</SectionTitle></div>
                <EmptyGuide error title={loadFailure("la colecta").title} text={error} onRetry={() => setReloadKey((key) => key + 1)} />
            </div>
        );
    }

    if (!shipments.length) {
        return (
            <div className="section active">
                <div className="section-header flex-between">
                    <div>
                        <SectionTitle icon="colecta">Colecta</SectionTitle>
                        <p className="section-subtitle">Envíos para colecta tradicional</p>
                    </div>
                    {accountSelector}
                </div>
                <EmptyGuide title={EMPTY_STATES.colecta.title} text={EMPTY_STATES.colecta.text} actions={EMPTY_STATES.colecta.actions} onNavigate={onNavigate} />
            </div>
        );
    }

    return (
        <div className="section active">
            <div className="section-header flex-between">
                <div>
                    <SectionTitle icon="colecta">Colecta</SectionTitle>
                    <p className="section-subtitle">{shipments.length} envíos de colecta</p>
                </div>
                {accountSelector}
            </div>

            <section className="card colecta-label-toolbar" aria-label="Acciones sobre etiquetas">
                <div className="colecta-label-selection">
                    <p role="status">
                        {selectedVisibleCount > 0 ? `${selectedVisibleCount} de ${shipments.length} envíos seleccionados` : 'Seleccioná los envíos para preparar sus etiquetas.'}
                    </p>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={toggleSelectAll}>
                        {areAllSelected(shipments) ? 'Deseleccionar todo' : 'Seleccionar todo'}
                    </button>
                </div>
                <div className="colecta-label-actions">
                        <LoadingButton isLoading={isPrintingBulk} className="btn btn-primary btn-sm" disabled={!selectedVisibleCount} onClick={handleBulkPrintLabels}>
                            Imprimir etiquetas
                        </LoadingButton>
                        <LoadingButton isLoading={isDownloadingBulk} className="btn btn-ghost btn-sm" disabled={!selectedVisibleCount} onClick={handleBulkDownloadLabels}>
                            Descargar ZPL
                        </LoadingButton>
                        <LoadingButton isLoading={isDeletingBulk} className="btn btn-ghost btn-sm colecta-label-delete" disabled={!selectedVisibleCount} onClick={handleBulkDelete}>
                            Eliminar envíos
                        </LoadingButton>
                </div>
            </section>

            <InfoDisclosure title="Envíos de Colecta" description={`${shipments.length} envíos · abrí el listado para seleccionar etiquetas`} className="card">
                {/* Desktop Table */}
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th style={{ width: '42px' }}>
                                    <input type="checkbox" checked={areAllSelected(shipments)} onChange={toggleSelectAll} aria-label="Seleccionar todas las etiquetas de colecta" />
                                </th>
                                <th>Producto</th>
                                {showAccountColumn && <th>Cuenta</th>}
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
                                    <td style={{ fontWeight: 600 }}>{renderProductMeta(s)}</td>
                                    {showAccountColumn && <td>{accountOf(s)}</td>}
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
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className="mobile-card-title">{s.product_name}</div>
                                    <MercadoLibreShipmentMeta shipment={s} compact />
                                </div>
                            </div>
                            <div className="mobile-card-body">
                                {showAccountColumn && (
                                    <div className="mobile-card-row">
                                        <span className="mobile-card-label">Cuenta</span>
                                        <span className="mobile-card-value">{accountOf(s)}</span>
                                    </div>
                                )}
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
                                    aria-label={`Eliminar envío ${s.id}`}
                                    style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
                                    onClick={() => handleDeleteShipment(s.id)}
                                >
                                    🗑️
                                </LoadingButton>
                            </div>
                        </div>
                    ))}
                </div>
            </InfoDisclosure>

            <MobileSelectionBar count={selectedVisibleCount} label="envíos seleccionados" onClear={clearSelection}>
                <LoadingButton isLoading={isPrintingBulk} className="btn btn-primary btn-sm" onClick={handleBulkPrintLabels}>
                    Imprimir etiquetas
                </LoadingButton>
                <LoadingButton isLoading={isDownloadingBulk} className="btn btn-ghost btn-sm" onClick={handleBulkDownloadLabels}>
                    Descargar ZPL
                </LoadingButton>
                <LoadingButton isLoading={isDeletingBulk} className="btn btn-ghost btn-sm colecta-label-delete" onClick={handleBulkDelete}>
                    Eliminar envíos
                </LoadingButton>
            </MobileSelectionBar>

            <LabelViewer shipmentId={viewingLabelId} onClose={() => setViewingLabelId(null)} />
        </div>
    );
}
