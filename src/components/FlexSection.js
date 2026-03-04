"use client";

import { useState, useEffect } from "react";
import { api, toast } from "@/lib/api";
import { useBatch } from "./BatchContext";

export default function FlexSection() {
    const { getQueryString, period, specificDate } = useBatch();
    const [shipments, setShipments] = useState([]);
    const [carriers, setCarriers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            setError(null);
            try {
                const qs = getQueryString('shipping_method=flex');
                const [shipmentsData, carriersData] = await Promise.all([
                    api(`/shipments?${qs}`),
                    api('/carriers'),
                ]);
                setShipments(shipmentsData);
                setCarriers(carriersData);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [period, specificDate]);

    const handleStatusChange = async (id, status) => {
        try {
            await api(`/shipments?id=${id}&status=${status}`, { method: 'PATCH' });
            setShipments(prev => prev.map(s => s.id === id ? { ...s, status } : s));
            toast(`Envío #${id} → ${status}`, 'success');
        } catch (err) {
            toast('Error actualizando estado', 'error');
        }
    };

    const handleReassign = async () => {
        try {
            const result = await api('/shipments/reassign-flex', { method: 'POST' });
            toast(`Reasignación completada: ${result.reassigned || 0} envíos`, 'success');
            // Refresh
            const qs = getQueryString('shipping_method=flex');
            const data = await api(`/shipments?${qs}`);
            setShipments(data);
        } catch (err) {
            toast('Error en reasignación', 'error');
        }
    };

    if (loading && !shipments.length) {
        return (
            <div className="section active">
                <div className="section-header"><h1 className="section-title">🚀 Flex</h1></div>
                <div className="spinner"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="section active">
                <div className="section-header"><h1 className="section-title">🚀 Flex</h1></div>
                <p style={{ color: "var(--danger)" }}>Error: {error}</p>
            </div>
        );
    }

    if (!shipments.length) {
        return (
            <div className="section active">
                <div className="section-header">
                    <h1 className="section-title">🚀 Flex</h1>
                    <p className="section-subtitle">Envíos de logística Flex</p>
                </div>
                <div className="empty-state">
                    <div className="empty-state-icon">🚀</div>
                    <p className="empty-state-text">Sin envíos Flex cargados.</p>
                </div>
            </div>
        );
    }

    const assigned = shipments.filter(s => s.assigned_carrier);
    const unassigned = shipments.filter(s => !s.assigned_carrier);

    // Group by carrier
    const byCarrier = {};
    assigned.forEach(s => {
        const c = s.assigned_carrier;
        if (!byCarrier[c]) byCarrier[c] = [];
        byCarrier[c].push(s);
    });

    return (
        <div className="section active">
            <div className="section-header flex-between">
                <div>
                    <h1 className="section-title">🚀 Flex</h1>
                    <p className="section-subtitle">{shipments.length} envíos flex — {assigned.length} asignados, {unassigned.length} sin asignar</p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleReassign}>🔄 Reasignar por zonas</button>
            </div>

            <div className="stats-grid">
                <div className="stat-card card accent"><div className="stat-value">{shipments.length}</div><div className="stat-label">Total Flex</div></div>
                <div className="stat-card card success"><div className="stat-value">{assigned.length}</div><div className="stat-label">Asignados</div></div>
                {unassigned.length > 0 && (
                    <div className="stat-card card danger"><div className="stat-value">{unassigned.length}</div><div className="stat-label">Sin Asignar</div></div>
                )}
            </div>

            {/* Per-carrier tables */}
            {Object.entries(byCarrier).map(([carrier, items]) => {
                const carrierData = carriers.find(c => c.name === carrier);

                // Zone breakdown for this carrier
                const byZone = {};
                items.forEach(s => {
                    const zone = s.partido || s.city || 'Sin zona';
                    byZone[zone] = (byZone[zone] || 0) + 1;
                });
                const zoneSorted = Object.entries(byZone).sort((a, b) => b[1] - a[1]);

                return (
                    <div key={carrier} className="card mb-md" style={{ borderLeft: `3px solid ${carrierData?.color || 'var(--accent)'}` }}>
                        <h3 style={{ marginBottom: "12px", fontSize: "15px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                            🚛 {carrierData?.display_name || carrier}
                            <span className="badge badge-flex">{items.length} envíos</span>
                        </h3>

                        {/* Zone breakdown */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "14px", padding: "10px 12px", background: "var(--bg-secondary)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", width: "100%", marginBottom: "4px" }}>📍 Desglose por zona</span>
                            {zoneSorted.map(([zone, count]) => (
                                <span key={zone} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "var(--radius-full)", background: "var(--surface)", border: "1px solid var(--border)", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                                    {zone} <strong style={{ color: carrierData?.color || 'var(--accent)' }}>{count}</strong>
                                </span>
                            ))}
                        </div>

                        <div className="table-container">
                            <table>
                                <thead><tr><th>Producto</th><th>Destino</th><th>Estado</th></tr></thead>
                                <tbody>
                                    {items.map(s => (
                                        <tr key={s.id}>
                                            <td style={{ fontWeight: 600 }}>{s.product_name}</td>
                                            <td>{s.city || 'N/A'}, {s.province || ''} · CP {s.postal_code || ''}</td>
                                            <td>
                                                <select className="status-select" value={s.status} onChange={(e) => handleStatusChange(s.id, e.target.value)}>
                                                    <option value="pendiente">🕒 Pendiente</option>
                                                    <option value="encontrado">🔍 Encontrado</option>
                                                    <option value="empaquetado">📦 Empaquetado</option>
                                                    <option value="despachado">✅ Despachado</option>
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}

            {unassigned.length > 0 && (
                <div className="card" style={{ borderLeft: "3px solid var(--danger)" }}>
                    <h3 style={{ marginBottom: "12px", fontSize: "15px", fontWeight: 700, color: "var(--danger)" }}>
                        ⚠️ Sin Asignar <span className="badge" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{unassigned.length}</span>
                    </h3>
                    <div className="table-container">
                        <table>
                            <thead><tr><th>Producto</th><th>Destino</th><th>Partido</th><th>Estado</th></tr></thead>
                            <tbody>
                                {unassigned.map(s => (
                                    <tr key={s.id}>
                                        <td style={{ fontWeight: 600 }}>{s.product_name}</td>
                                        <td>{s.city || 'N/A'}, {s.province || ''}</td>
                                        <td>{s.partido || '—'}</td>
                                        <td>
                                            <select className="status-select" value={s.status} onChange={(e) => handleStatusChange(s.id, e.target.value)}>
                                                <option value="pendiente">🕒 Pendiente</option>
                                                <option value="encontrado">🔍 Encontrado</option>
                                                <option value="empaquetado">📦 Empaquetado</option>
                                                <option value="despachado">✅ Despachado</option>
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
