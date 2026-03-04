"use client";

import { useState, useEffect } from "react";
import { api, toast } from "@/lib/api";
import { useBatch } from "./BatchContext";

// Reverse lookup: partido_id -> zone group name
const PARTIDO_ZONES = {
    capital_federal: 'CABA',
    san_isidro: 'GBA 1', vicente_lopez: 'GBA 1', san_fernando: 'GBA 1', san_martin: 'GBA 1',
    '3_de_febrero': 'GBA 1', hurlingham: 'GBA 1', ituzaingo: 'GBA 1', moron: 'GBA 1',
    avellaneda: 'GBA 1', lanus: 'GBA 1',
    tigre: 'GBA 2', malvinas_argentinas: 'GBA 2', jose_c_paz: 'GBA 2', san_miguel: 'GBA 2',
    moreno: 'GBA 2', merlo: 'GBA 2', la_matanza: 'GBA 2', ezeiza: 'GBA 2',
    esteban_echeverria: 'GBA 2', almirante_brown: 'GBA 2', lomas_de_zamora: 'GBA 2',
    quilmes: 'GBA 2', berazategui: 'GBA 2', florencio_varela: 'GBA 2',
    escobar: 'GBA 3', pilar: 'GBA 3', general_rodriguez: 'GBA 3', marcos_paz: 'GBA 3',
    canuelas: 'GBA 3', san_vicente: 'GBA 3', pte_peron: 'GBA 3', ensenada: 'GBA 3',
    la_plata: 'GBA 3', berisso: 'GBA 3',
};

export default function FlexSection() {
    const { getTodayQueryString } = useBatch();
    const [shipments, setShipments] = useState([]);
    const [carriers, setCarriers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            setError(null);
            try {
                const qs = getTodayQueryString('shipping_method=flex');
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
    }, []);

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
            const qs = getTodayQueryString('shipping_method=flex');
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

                // Zone breakdown by zone group (CABA, GBA 1, GBA 2, GBA 3)
                const byZone = {};
                items.forEach(s => {
                    const zoneName = PARTIDO_ZONES[s.partido] || 'Otra';
                    byZone[zoneName] = (byZone[zoneName] || 0) + 1;
                });
                const zoneOrder = ['CABA', 'GBA 1', 'GBA 2', 'GBA 3', 'Otra'];
                const zoneSorted = zoneOrder.filter(z => byZone[z]).map(z => [z, byZone[z]]);

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
