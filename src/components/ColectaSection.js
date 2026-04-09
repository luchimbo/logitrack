"use client";

import { useState, useEffect } from "react";
import { api, toast } from "@/lib/api";
import { useBatch } from "./BatchContext";
import { useIsMobile } from "@/hooks/useMediaQuery";

export default function ColectaSection() {
    const { getTodayQueryString } = useBatch();
    const [shipments, setShipments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const isMobile = useIsMobile();

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            setError(null);
            try {
                const qs = getTodayQueryString('shipping_method=colecta');
                const data = await api(`/shipments?${qs}`);
                setShipments(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [getTodayQueryString]);


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

            <div className="card">
                {/* Desktop Table */}
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Producto</th>
                                <th>Destinatario</th>
                                <th>Ciudad</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shipments.map(s => (
                                <tr key={s.id}>
                                    <td style={{ fontWeight: 600 }}>{s.product_name}</td>
                                    <td>{s.recipient_name || 'N/A'}</td>
                                    <td>{s.city || 'N/A'}, {s.province || ''}</td>
                                    <td>
                                        <button
                                            className="btn btn-sm"
                                            style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
                                            onClick={() => handleDeleteShipment(s.id)}
                                        >
                                            🗑️ Eliminar
                                        </button>
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
                                    style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
                                    onClick={() => handleDeleteShipment(s.id)}
                                >
                                    🗑️ Eliminar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
