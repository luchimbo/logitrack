"use client";

import { useState, useEffect } from "react";
import { api, toast } from "@/lib/api";
import { useBatch } from "./BatchContext";

export default function ColectaSection() {
    const { currentBatchId } = useBatch();
    const [data, setData] = useState({ picking: [], shipments: [] });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchData() {
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
                    api(`/shipments${batchParam}&shipping_method=colecta`),
                ]);

                setData({ picking: pickingList, shipments });
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [currentBatchId]);

    const handleStatusChange = async (shipmentIds, newStatus) => {
        try {
            // In Next.js we need a custom batch update endpoint or loop. 
            // For now, let's process them sequentially or send a single batch request if we build it.
            // We will loop through the IDs and hit the PATCH endpoint we created.
            const promises = shipmentIds.map(id =>
                api(`/shipments?id=${id}&status=${newStatus}`, { method: 'PATCH' })
            );
            await Promise.all(promises);

            // Update local state to reflect UI change immediately without full refetch
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

    const markAllFound = async () => {
        const colectaPicking = data.picking.filter(p => p.shipping_method === 'colecta');
        for (const item of colectaPicking) {
            const allFound = item.statuses.every(s => s !== 'pendiente');
            if (!allFound) {
                await handleStatusChange(item.shipment_ids, 'encontrado');
                // Small delay to prevent rate limits
                await new Promise(r => setTimeout(r, 100));
            }
        }
    };

    if (loading) {
        return (
            <div className="section active">
                <div className="section-header">
                    <h1 className="section-title">📦 Colecta</h1>
                    <p className="section-subtitle">Envíos por Mercado Envíos (Colecta)</p>
                </div>
                <div className="spinner"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="section active">
                <div className="section-header">
                    <h1 className="section-title">📦 Colecta</h1>
                </div>
                <p style={{ color: "var(--danger)" }}>Error: {error}</p>
            </div>
        );
    }

    const colectaPicking = (data.picking || []).filter(p => p.shipping_method === 'colecta');
    const totalPackages = (data.shipments || []).length;
    const totalUnits = colectaPicking.reduce((sum, p) => sum + p.total_quantity, 0);
    const completedProducts = colectaPicking.filter(p => p.statuses.every(s => s !== 'pendiente')).length;

    const carriers = {};
    (data.shipments || []).forEach(s => {
        const c = s.carrier_name || 'Sin nombre';
        carriers[c] = (carriers[c] || 0) + 1;
    });

    colectaPicking.sort((a, b) => {
        const aComplete = a.statuses.every(s => s !== 'pendiente');
        const bComplete = b.statuses.every(s => s !== 'pendiente');
        if (aComplete !== bComplete) return aComplete ? 1 : -1;
        return b.total_quantity - a.total_quantity;
    });

    return (
        <div className="section active">
            <div className="section-header flex-between">
                <div>
                    <h1 className="section-title">📦 Colecta</h1>
                    <p className="section-subtitle">Envíos por Mercado Envíos (Colecta)</p>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    <button className="btn btn-success btn-sm" onClick={markAllFound}>
                        ✅ Marcar todo encontrado
                    </button>
                </div>
            </div>

            <div className="stats-grid">
                <div className="stat-card card warning">
                    <div className="stat-value">{totalPackages}</div>
                    <div className="stat-label">Paquetes Colecta</div>
                </div>
                <div className="stat-card card info">
                    <div className="stat-value">{colectaPicking.length}</div>
                    <div className="stat-label">Productos Distintos</div>
                </div>
                <div className="stat-card card accent">
                    <div className="stat-value">{totalUnits}</div>
                    <div className="stat-label">Unidades Total</div>
                </div>
                <div className="stat-card card success">
                    <div className="stat-value">{completedProducts}/{colectaPicking.length}</div>
                    <div className="stat-label">Encontrados</div>
                </div>
            </div>

            {Object.keys(carriers).length > 0 && (
                <div className="card mb-md">
                    <h3 style={{ marginBottom: "12px", fontSize: "14px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Transportistas Colecta
                    </h3>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {Object.entries(carriers).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                            <span key={name} className="badge badge-colecta" style={{ fontSize: "13px", padding: "6px 14px" }}>
                                🚛 {name}: {count}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="progress-bar mb-md">
                <div className="progress-fill" style={{ width: `${colectaPicking.length > 0 ? (completedProducts / colectaPicking.length * 100).toFixed(0) : 0}%` }}></div>
            </div>

            <h3 style={{ marginBottom: "16px", fontSize: "14px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Lista de Picking — Colecta
            </h3>

            <div id="colecta-picking-items">
                {colectaPicking.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">📦</div>
                        <p className="empty-state-text">No hay envíos Colecta.<br />Subí etiquetas primero.</p>
                    </div>
                ) : (
                    colectaPicking.map((item, idx) => {
                        const allFound = item.statuses.every(s => s !== 'pendiente');
                        return (
                            <div key={idx} className={`picking-item ${allFound ? 'completed' : ''}`}>
                                <input
                                    type="checkbox"
                                    className="picking-checkbox"
                                    checked={allFound}
                                    onChange={(e) => handleStatusChange(item.shipment_ids, e.target.checked ? 'encontrado' : 'pendiente')}
                                />
                                <div className="picking-qty">{item.total_quantity}</div>
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
