"use client";

import { useState, useEffect } from "react";
import { api, toast } from "@/lib/api";
import { useBatch } from "./BatchContext";

export default function CarrierView() {
    const { getQueryString, period, specificDate } = useBatch();
    const [shipments, setShipments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            setError(null);
            try {
                const qs = getQueryString('shipping_method=flex');
                const data = await api(`/shipments?${qs}`);
                setShipments(data);
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
                                        <select className="status-select" value={s.status} onChange={(e) => handleStatusChange(s.id, e.target.value)}>
                                            <option value="pendiente">🕒 Pendiente</option>
                                            <option value="encontrado">🔍 Encontrado</option>
                                            <option value="empaquetado">📦 Empaquetado</option>
                                            <option value="despachado">✅ Despachado</option>
                                        </select>
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
