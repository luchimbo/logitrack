"use client";

import { useState, useEffect } from "react";
import { api, toast } from "@/lib/api";
import { useBatch } from "./BatchContext";

export default function FlexSection() {
    const { currentBatchId } = useBatch();
    const [data, setData] = useState({ picking: [], shipments: [] });
    const [loading, setLoading] = useState(false);
    const [recalculating, setRecalculating] = useState(false);
    const [error, setError] = useState(null);

    const fetchData = async () => {
        if (!currentBatchId) {
            setData({ picking: [], shipments: [] });
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const batchParam = `?batch_id=${currentBatchId}`;
            const [pickingList, shipments] = await Promise.all([
                api(`/picking-list${batchParam}`),
                api(`/shipments${batchParam}&shipping_method=flex`),
            ]);
            setData({ picking: pickingList, shipments });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [currentBatchId]);

    const handleStatusChange = async (shipmentIds, newStatus) => {
        try {
            const promises = shipmentIds.map(id =>
                api(`/shipments?id=${id}&status=${newStatus}`, { method: 'PATCH' })
            );
            await Promise.all(promises);

            setData(prev => {
                const nextPicking = prev.picking.map(p => {
                    if (p.shipment_ids.some(id => shipmentIds.includes(id))) {
                        return {
                            ...p,
                            statuses: p.statuses.map((s, idx) => shipmentIds.includes(p.shipment_ids[idx]) ? newStatus : s)
                        }
                    }
                    return p;
                });
                return { ...prev, picking: nextPicking };
            });

            toast(`${shipmentIds.length} envío(s) ➔ ${newStatus}`, 'success');
        } catch (err) {
            toast('Error actualizando estado', 'error');
            console.error(err);
        }
    };

    const handleRecalculate = async () => {
        if (!currentBatchId) return;
        setRecalculating(true);
        try {
            const res = await api(`/shipments/reassign-flex?batch_id=${currentBatchId}`, { method: 'POST' });
            toast(`✅ Asignaciones actualizadas (${res.updated} cambios)`, 'success');
            await fetchData(); // Refetch Data
        } catch (err) {
            toast('Error al recalcular zonas', 'error');
        } finally {
            setRecalculating(false);
        }
    };

    const markAllFound = async () => {
        const flexPicking = data.picking.filter(p => p.shipping_method === 'flex');
        for (const item of flexPicking) {
            const allFound = item.statuses.every(s => s !== 'pendiente');
            if (!allFound) {
                await handleStatusChange(item.shipment_ids, 'encontrado');
                await new Promise(r => setTimeout(r, 100)); // Prevent flooding
            }
        }
    };

    if (loading && !data.shipments.length) {
        return (
            <div className="section active">
                <div className="section-header">
                    <h1 className="section-title">🚀 Flex</h1>
                    <p className="section-subtitle">Envíos por Mercado Envíos Flex (despacho propio)</p>
                </div>
                <div className="spinner"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="section active">
                <div className="section-header">
                    <h1 className="section-title">🚀 Flex</h1>
                </div>
                <p style={{ color: "var(--danger)" }}>Error: {error}</p>
            </div>
        );
    }

    const flexPicking = (data.picking || []).filter(p => p.shipping_method === 'flex');
    const totalPackages = (data.shipments || []).length;
    const totalUnits = flexPicking.reduce((sum, p) => sum + p.total_quantity, 0);
    const completedProducts = flexPicking.filter(p => p.statuses.every(s => s !== 'pendiente')).length;

    const carrierGroups = {};
    (data.shipments || []).forEach(s => {
        const c = s.assigned_carrier || 'Sin asignar';
        if (!carrierGroups[c]) carrierGroups[c] = [];
        carrierGroups[c].push(s);
    });

    flexPicking.sort((a, b) => {
        const aComplete = a.statuses.every(s => s !== 'pendiente');
        const bComplete = b.statuses.every(s => s !== 'pendiente');
        if (aComplete !== bComplete) return aComplete ? 1 : -1;
        return b.total_quantity - a.total_quantity;
    });

    return (
        <div className="section active">
            <div className="section-header flex-between">
                <div>
                    <h1 className="section-title">🚀 Flex</h1>
                    <p className="section-subtitle">Envíos por Mercado Envíos Flex (despacho propio)</p>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={handleRecalculate}
                        disabled={recalculating}
                    >
                        {recalculating ? '⏳ Recalculando...' : '🔄 Recalcular Zonas'}
                    </button>
                    <button className="btn btn-success btn-sm" onClick={markAllFound}>
                        ✅ Marcar todo encontrado
                    </button>
                </div>
            </div>

            <div className="stats-grid">
                <div className="stat-card card accent">
                    <div className="stat-value">{totalPackages}</div>
                    <div className="stat-label">Paquetes Flex</div>
                </div>
                <div className="stat-card card info">
                    <div className="stat-value">{flexPicking.length}</div>
                    <div className="stat-label">Productos Distintos</div>
                </div>
                <div className="stat-card card warning">
                    <div className="stat-value">{totalUnits}</div>
                    <div className="stat-label">Unidades Total</div>
                </div>
                <div className="stat-card card success">
                    <div className="stat-value">{completedProducts}/{flexPicking.length}</div>
                    <div className="stat-label">Encontrados</div>
                </div>
            </div>

            {Object.keys(carrierGroups).length > 0 && (
                <div className="card mb-md">
                    <h3 style={{ marginBottom: "12px", fontSize: "14px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Asignación de Transportistas Flex
                    </h3>
                    <div className="carrier-grid">
                        {Object.entries(carrierGroups)
                            .sort((a, b) => b[1].length - a[1].length)
                            .map(([carrier, items]) => {
                                const isUnassigned = carrier === 'Sin asignar';
                                const color = isUnassigned ? '#ef4444' : '#6366f1';
                                return (
                                    <div key={carrier} className="carrier-column" style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
                                        <div className="carrier-header" style={{ background: `${color}20`, borderBottom: `2px solid ${color}` }}>
                                            <span style={{ color }}>{isUnassigned ? '⚠️' : '🚛'} {carrier}</span>
                                            <span className="carrier-count" style={{ background: `${color}30`, color }}>{items.length}</span>
                                        </div>
                                        <div className="carrier-shipments">
                                            {items.map(s => (
                                                <div key={s.id} className="carrier-shipment-item">
                                                    <div className="product">{s.product_name}</div>
                                                    <div className="destination">📍 {s.city || 'N/A'}, {s.province || 'N/A'} · CP {s.postal_code || 'N/A'}</div>
                                                    <div style={{ marginTop: "4px", color: "var(--text-muted)", fontSize: "12px" }}>👤 {s.recipient_name || 'N/A'}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}

            <div className="progress-bar mb-md">
                <div className="progress-fill" style={{ width: `${flexPicking.length > 0 ? (completedProducts / flexPicking.length * 100).toFixed(0) : 0}%` }}></div>
            </div>

            <h3 style={{ marginBottom: "16px", fontSize: "14px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Lista de Picking — Flex
            </h3>

            <div id="flex-picking-items">
                {flexPicking.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">🚀</div>
                        <p className="empty-state-text">No hay envíos Flex.<br />Subí etiquetas primero.</p>
                    </div>
                ) : (
                    flexPicking.map((item, idx) => {
                        const allFound = item.statuses.every(s => s !== 'pendiente');
                        return (
                            <div key={idx} className={`picking-item ${allFound ? 'completed' : ''}`}>
                                <input
                                    type="checkbox"
                                    className="picking-checkbox"
                                    checked={allFound}
                                    onChange={(e) => handleStatusChange(item.shipment_ids, e.target.checked ? 'encontrado' : 'pendiente')}
                                />
                                <div className="picking-qty" style={{ background: "var(--accent-light)" }}>{item.total_quantity}</div>
                                <div className="picking-info">
                                    <div className="picking-name">{item.product_name}</div>
                                    <div className="picking-sku">
                                        SKU: {item.sku || 'N/A'}
                                        {item.color ? ` · ${item.color}` : ''}
                                        {' · '}{item.shipment_count} envío{item.shipment_count > 1 ? 's' : ''}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
