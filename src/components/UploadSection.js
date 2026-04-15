"use client";

import { useState, useRef, useEffect } from "react";
import { api, toast } from "@/lib/api";
import { useBatch } from "./BatchContext";
import { useIsMobile } from "@/hooks/useMediaQuery";
import LabelViewer from "./LabelViewer";

export default function UploadSection() {
    const [isDragOver, setIsDragOver] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);
    const [todayShipments, setTodayShipments] = useState([]);
    const [showShipments, setShowShipments] = useState(false);
    const [selectedShipmentIds, setSelectedShipmentIds] = useState([]);
    const [viewingLabelId, setViewingLabelId] = useState(null);
    const isMobile = useIsMobile();

    const fileInputRef = useRef(null);
    const { batches, reloadBatches, setCurrentBatchId } = useBatch();

    // Fetch today's shipments
    const fetchTodayShipments = async () => {
        try {
            const data = await api('/shipments?period=today');
            setTodayShipments(data);
            setSelectedShipmentIds([]);
        } catch (err) {
            console.error("Failed to load shipments:", err);
        }
    };

    useEffect(() => {
        fetchTodayShipments();
    }, []);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files);
        }
    };

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            processFiles(e.target.files);
        }
    };

    const processFiles = async (files) => {
        setIsUploading(true);
        setUploadResult(null);

        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }

        try {
            const result = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (!result.ok) throw new Error("Error al procesar archivos");

            const data = await result.json();
            setUploadResult(data);

            // Update global context
            await reloadBatches();
            setCurrentBatchId(data.batch_id);
            fetchTodayShipments();

            toast(`✅ ${data.total_parsed} nuevos envíos agregados (${data.total_in_batch} total)`, "success");
        } catch (error) {
            console.error(error);
            toast("Error procesando las etiquetas", "error");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleDeleteShipment = async (id) => {
        try {
            await api(`/shipments/${id}`, { method: 'DELETE' });
            setTodayShipments(prev => prev.filter(s => s.id !== id));
            setSelectedShipmentIds(prev => prev.filter((shipmentId) => shipmentId !== id));
            toast('Envío eliminado', 'success');
        } catch (err) {
            toast('Error al eliminar', 'error');
        }
    };

    const toggleShipmentSelection = (id) => {
        setSelectedShipmentIds((prev) => prev.includes(id) ? prev.filter((shipmentId) => shipmentId !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedShipmentIds.length === todayShipments.length) {
            setSelectedShipmentIds([]);
            return;
        }
        setSelectedShipmentIds(todayShipments.map((shipment) => shipment.id));
    };

    const handleBulkDelete = async () => {
        if (!selectedShipmentIds.length) return;
        if (!confirm(`¿Eliminar ${selectedShipmentIds.length} envíos seleccionados? Esta acción no se puede deshacer.`)) return;

        try {
            const result = await api('/shipments/bulk', {
                method: 'DELETE',
                body: JSON.stringify({ ids: selectedShipmentIds }),
            });
            setTodayShipments((prev) => prev.filter((shipment) => !selectedShipmentIds.includes(shipment.id)));
            setSelectedShipmentIds([]);
            toast(`${result.deleted || 0} envíos eliminados`, 'success');
            await reloadBatches();
        } catch (err) {
            toast('Error al eliminar envíos seleccionados', 'error');
        }
    };

    const handleClearToday = async () => {
        if (!confirm('¿Seguro que querés eliminar TODOS los envíos de hoy? Esta acción no se puede deshacer.')) return;
        try {
            await api('/shipments?period=today', { method: 'DELETE' });
            setTodayShipments([]);
            setUploadResult(null);
            await reloadBatches();
            toast('Todos los envíos de hoy eliminados', 'success');
        } catch (err) {
            toast('Error al limpiar', 'error');
        }
    };

    const handleDeleteBatch = async (batchId) => {
        if (!confirm('¿Eliminar todos los envíos de este lote?')) return;
        try {
            await api(`/shipments?batch_id=${batchId}`, { method: 'DELETE' });
            fetchTodayShipments();
            await reloadBatches();
            toast('Lote eliminado', 'success');
        } catch (err) {
            toast('Error al eliminar lote', 'error');
        }
    };

    const today = new Date().toISOString().slice(0, 10);
    const todayBatches = batches.filter(b => b.date === today);

    return (
        <div id="section-upload" className="section active">
            <div className="section-header">
                <h1 className="section-title">📦 Subir Etiquetas</h1>
                <p className="section-subtitle">Arrastrá o seleccioná archivos ZPL/TXT. Las etiquetas se procesan y entran directo a la operación del workspace actual.</p>
            </div>

            <div
                className={`upload-zone ${isDragOver ? 'dragover' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <input
                    type="file"
                    className="upload-input"
                    ref={fileInputRef}
                    multiple
                    accept=".txt,.zpl,.TXT,.ZPL"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                />
                <div className="upload-icon">📄</div>
                <p className="upload-title">Arrastrá archivos aquí</p>
                <p className="upload-subtitle">o hacé click para seleccionar — Archivos .txt o .zpl</p>
            </div>

            {isUploading && (
                <div className="mt-md" style={{ display: 'block' }}>
                    <div className="card">
                        <div className="flex-between mb-md">
                            <span>Procesando archivos...</span>
                            <div className="spinner" style={{ width: '24px', height: '24px', margin: 0 }}></div>
                        </div>
                        <div className="progress-bar">
                            <div className="progress-fill" style={{ width: '100%', transition: 'width 2s' }}></div>
                        </div>
                    </div>
                </div>
            )}

            {uploadResult && !isUploading && (
                <div className="mt-lg">
                    <div className="card" style={{ borderColor: 'var(--success)', borderLeft: '4px solid var(--success)' }}>
                        <h3 style={{ marginBottom: '16px' }}>✅ Resumen de Carga</h3>

                        <div className="stats-grid">
                            <div className="stat-card card accent">
                                <div className="stat-value">{uploadResult.total_in_batch}</div>
                                <div className="stat-label">Total en el lote</div>
                            </div>
                            <div className="stat-card card success">
                                <div className="stat-value">{uploadResult.total_parsed}</div>
                                <div className="stat-label">Nuevos agregados</div>
                            </div>
                        </div>

                        {uploadResult.total_skipped > 0 && (
                            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '12px' }}>
                                ⚠️ {uploadResult.total_skipped} envíos duplicados omitidos (ya estaban cargados)
                            </p>
                        )}

                        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                            Revisá el total del lote y, si hace falta, abrí “Datos de Hoy” para validar los envíos cargados antes de seguir operando.
                        </p>

                        <div className="flex-between gap-sm" style={{ flexWrap: 'wrap', marginTop: '16px' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                                Archivos subidos: {uploadResult.filenames?.join(', ')}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Today's data management */}
            <div className="mt-lg">
                <div className="card">
                    <div className="flex-between mb-md" style={{ flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '16px' : '8px', alignItems: isMobile ? 'stretch' : 'center' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
                            📋 Datos de Hoy ({todayShipments.length})
                        </h3>
                        <div style={{ display: 'flex', gap: '8px', width: isMobile ? '100%' : 'auto' }}>
                            <button className="btn btn-ghost btn-sm" style={{ flex: isMobile ? 1 : 'none' }} onClick={() => { setShowShipments(!showShipments); if (!showShipments) fetchTodayShipments(); }}>
                                {showShipments ? '🔼 Ocultar' : '🔽 Ver'}
                            </button>
                            {todayShipments.length > 0 && (
                                <button className="btn btn-sm" onClick={handleClearToday} style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)', flex: isMobile ? 1 : 'none' }}>
                                    🗑️ Limpiar
                                </button>
                            )}
                        </div>
                    </div>

                    {showShipments && todayShipments.length > 0 && (
                        <div className="card" style={{ marginBottom: '16px', padding: '14px 16px', background: 'var(--bg-secondary)' }}>
                            <div className="flex-between" style={{ gap: '12px', flexWrap: 'wrap' }}>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                                    {selectedShipmentIds.length > 0
                                        ? `${selectedShipmentIds.length} envíos seleccionados`
                                        : 'Seleccioná envíos para borrar varios de una vez'}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <button className="btn btn-ghost btn-sm" onClick={toggleSelectAll}>
                                        {selectedShipmentIds.length === todayShipments.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                                    </button>
                                    <button className="btn btn-sm" disabled={!selectedShipmentIds.length} onClick={handleBulkDelete} style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' }}>
                                        🗑️ Eliminar seleccionados
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Today's batches */}
                    {todayBatches.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Lotes cargados hoy</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                                {todayBatches.map(b => (
                                    <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'var(--surface-hover)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: '13px' }}>
                                        <span style={{ fontWeight: 600 }}>Lote #{b.id}</span>
                                        <span style={{ color: 'var(--text-muted)' }}>· {b.total_packages} envíos</span>
                                        {b.filenames && <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>· {b.filenames}</span>}
                                        <button onClick={() => handleDeleteBatch(b.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '12px', padding: '0 4px' }} title="Eliminar lote">🗑️</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Individual shipments */}
                    {showShipments && todayShipments.length > 0 && (
                        <>
                            {/* Desktop Table */}
                            <div className="table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th style={{ width: '42px' }}>
                                                <input type="checkbox" checked={todayShipments.length > 0 && selectedShipmentIds.length === todayShipments.length} onChange={toggleSelectAll} />
                                            </th>
                                            <th>Producto</th>
                                            <th>Destinatario</th>
                                            <th>Método</th>
                                            <th>Estado</th>
                                            <th style={{ width: '50px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {todayShipments.map(s => (
                                            <tr key={s.id}>
                                                <td>
                                                    <input type="checkbox" checked={selectedShipmentIds.includes(s.id)} onChange={() => toggleShipmentSelection(s.id)} />
                                                </td>
                                                <td style={{ fontWeight: 600 }}>{s.product_name}</td>
                                                <td>{s.recipient_name || 'N/A'}</td>
                                                <td>
                                                    <span className={`badge ${s.shipping_method === 'flex' ? 'badge-flex' : 'badge-colecta'}`}>
                                                        {s.shipping_method || 'colecta'}
                                                    </span>
                                                </td>
                                            <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{s.status}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <button
                                                        className="btn btn-sm"
                                                        onClick={() => setViewingLabelId(s.id)}
                                                        style={{ background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                                                    >
                                                        Ver etiqueta
                                                    </button>
                                                    <button onClick={() => handleDeleteShipment(s.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '14px' }} title="Eliminar envío">✕</button>
                                                </div>
                                            </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile Cards */}
                            <div className="mobile-cards-container">
                                {todayShipments.map(s => (
                                    <div key={s.id} className="mobile-card">
                                        <div className="mobile-card-header">
                                            <input type="checkbox" checked={selectedShipmentIds.includes(s.id)} onChange={() => toggleShipmentSelection(s.id)} />
                                            <div className="mobile-card-title">{s.product_name}</div>
                                        </div>
                                        <div className="mobile-card-body">
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Destinatario</span>
                                                <span className="mobile-card-value">{s.recipient_name || 'N/A'}</span>
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Método</span>
                                                <span className={`badge ${s.shipping_method === 'flex' ? 'badge-flex' : 'badge-colecta'}`}>
                                                    {s.shipping_method || 'colecta'}
                                                </span>
                                            </div>
                                            <div className="mobile-card-row">
                                                <span className="mobile-card-label">Estado</span>
                                                <span className="mobile-card-value">{s.status}</span>
                                            </div>
                                        </div>
                                        <div className="mobile-card-actions">
                                            <button
                                                className="btn btn-sm"
                                                onClick={() => setViewingLabelId(s.id)}
                                                style={{ background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                                            >
                                                Ver etiqueta
                                            </button>
                                            <button 
                                                className="btn btn-sm" 
                                                onClick={() => handleDeleteShipment(s.id)}
                                                style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
                                            >
                                                🗑️ Eliminar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {showShipments && todayShipments.length === 0 && (
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>No hay envíos cargados hoy.</p>
                    )}
                </div>
            </div>

            <LabelViewer shipmentId={viewingLabelId} onClose={() => setViewingLabelId(null)} />
        </div>
    );
}
