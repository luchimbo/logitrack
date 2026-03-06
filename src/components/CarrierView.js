"use client";

import { useState, useEffect } from "react";
import { api, toast } from "@/lib/api";
import { useBatch } from "./BatchContext";

export default function CarrierView() {
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
                    api('/carriers')
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

    const handleCarrierChange = async (id, newCarrier) => {
        try {
            await api(`/shipments?id=${id}&assigned_carrier=${encodeURIComponent(newCarrier)}`, { method: 'PATCH' });
            setShipments(prev => prev.map(s => s.id === id ? { ...s, assigned_carrier: newCarrier || null } : s));
            toast(`Transportista actualizado`, 'success');
        } catch (err) {
            toast('Error actualizando transportista', 'error');
        }
    };

    const getCarrierSelectStyle = (carrierName) => {
        const c = carriers.find(x => x.name === carrierName);
        if (!c || !c.color) {
            return { fontSize: "11px", padding: "4px", borderRadius: "var(--radius)", border: "1px solid var(--danger)", background: "var(--danger-bg)", color: "var(--danger)", fontWeight: 600, cursor: "pointer", outline: "none" };
        }
        return {
            fontSize: "11px", padding: "4px", borderRadius: "var(--radius)",
            border: `1px solid ${c.color}60`, background: `${c.color}15`, color: c.color,
            fontWeight: 600, cursor: "pointer", outline: "none"
        };
    };

    const handleDeleteShipment = async (id) => {
        const ok = window.confirm(`¿Eliminar el envío #${id}? Esta acción no se puede deshacer.`);
        if (!ok) return;

        try {
            await api(`/shipments/${id}`, { method: 'DELETE' });
            setShipments(prev => prev.filter(s => s.id !== id));
            toast(`Envío #${id} eliminado`, 'success');
        } catch (err) {
            toast('Error eliminando envío', 'error');
        }
    };

    if (loading && !shipments.length) {
        return (
            <div className="section active">
                <div className="section-header"><h1 className="section-title">🚛 Transportistas</h1></div>
                <div className="spinner"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="section active">
                <div className="section-header"><h1 className="section-title">🚛 Transportistas</h1></div>
                <p style={{ color: "var(--danger)" }}>Error: {error}</p>
            </div>
        );
    }

    if (!shipments.length) {
        return (
            <div className="section active">
                <div className="section-header">
                    <h1 className="section-title">🚛 Transportistas</h1>
                    <p className="section-subtitle">Envíos Flex agrupados por transportista</p>
                </div>
                <div className="empty-state">
                    <div className="empty-state-icon">🚛</div>
                    <p className="empty-state-text">No hay envíos Flex cargados.</p>
                </div>
            </div>
        );
    }

    const groups = {};
    shipments.forEach(s => {
        const groupKey = s.assigned_carrier || 'flex-sin-asignar';
        const groupLabel = s.assigned_carrier || '⚠️ Flex Sin Asignar';
        const groupColor = s.assigned_carrier ? '#6366f1' : '#ef4444';
        if (!groups[groupKey]) groups[groupKey] = { label: groupLabel, color: groupColor, shipments: [] };
        groups[groupKey].shipments.push(s);
    });

    const flexCount = shipments.length;
    const unassignedFlex = shipments.filter(s => s.shipping_method === 'flex' && !s.assigned_carrier).length;

    const sortedGroups = Object.entries(groups).sort((a, b) => {
        if (a[0].includes('sin-asignar')) return 1;
        if (b[0].includes('sin-asignar')) return -1;
        return b[1].shipments.length - a[1].shipments.length;
    });

    return (
        <div className="section active">
            <div className="section-header">
                <h1 className="section-title">🚛 Transportistas</h1>
                <p className="section-subtitle">Envíos Flex agrupados por transportista</p>
            </div>

            <div className="stats-grid">
                <div className="stat-card card accent"><div className="stat-value">{shipments.length}</div><div className="stat-label">Total</div></div>
                <div className="stat-card card info"><div className="stat-value">{flexCount}</div><div className="stat-label">Flex</div></div>
                {unassignedFlex > 0 && <div className="stat-card card danger"><div className="stat-value">{unassignedFlex}</div><div className="stat-label">Sin Asignar</div></div>}
            </div>

            <div className="carrier-grid">
                {sortedGroups.map(([key, group]) => (
                    <div key={key} className="carrier-column card">
                        <div className="carrier-header" style={{ background: `${group.color}20`, borderBottom: `2px solid ${group.color}` }}>
                            <span style={{ color: group.color }}>{group.label}</span>
                            <span className="carrier-count" style={{ background: `${group.color}30`, color: group.color }}>{group.shipments.length}</span>
                        </div>
                        <div className="carrier-shipments">
                            {group.shipments.map(s => (
                                <div key={s.id} className="carrier-shipment-item">
                                    <div className="product">{s.product_name}</div>
                                    <div className="destination">📍 {s.city || 'N/A'}, {s.province || ''} · CP {s.postal_code || ''}</div>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                                        <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>👤 {s.recipient_name || 'N/A'}</span>
                                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                            <select
                                                style={getCarrierSelectStyle(s.assigned_carrier)}
                                                value={s.assigned_carrier || ''}
                                                onChange={(e) => handleCarrierChange(s.id, e.target.value)}
                                            >
                                                <option value="" style={{ color: "var(--text)" }}>Sin asignar</option>
                                                {carriers.map(c => (
                                                    <option key={c.name} value={c.name} style={{ color: "var(--text)" }}>{c.display_name}</option>
                                                ))}
                                            </select>
                                            <button
                                                className="btn btn-sm"
                                                style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
                                                onClick={() => handleDeleteShipment(s.id)}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
