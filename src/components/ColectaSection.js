"use client";

import { useState, useEffect } from "react";
import { api, toast } from "@/lib/api";
import { useBatch } from "./BatchContext";

export default function ColectaSection() {
    const { getQueryString, period, specificDate } = useBatch();
    const [shipments, setShipments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            setError(null);
            try {
                const qs = getQueryString('shipping_method=colecta');
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

    const markAllAs = async (status) => {
        const pending = shipments.filter(s => s.status === 'pendiente');
        for (const s of pending) {
            await handleStatusChange(s.id, status);
            await new Promise(r => setTimeout(r, 50));
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

    const pendiente = shipments.filter(s => s.status === 'pendiente').length;
    const encontrado = shipments.filter(s => s.status === 'encontrado').length;
    const empaquetado = shipments.filter(s => s.status === 'empaquetado').length;
    const despachado = shipments.filter(s => s.status === 'despachado').length;

    return (
        <div className="section active">
            <div className="section-header flex-between">
                <div>
                    <h1 className="section-title">📦 Colecta</h1>
                    <p className="section-subtitle">{shipments.length} envíos de colecta</p>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    <button className="btn btn-success btn-sm" onClick={() => markAllAs('encontrado')}>✅ Marcar encontrados</button>
                </div>
            </div>

            <div className="stats-grid">
                <div className="stat-card card warning"><div className="stat-value">{pendiente}</div><div className="stat-label">Pendientes</div></div>
                <div className="stat-card card info"><div className="stat-value">{encontrado}</div><div className="stat-label">Encontrados</div></div>
                <div className="stat-card card accent"><div className="stat-value">{empaquetado}</div><div className="stat-label">Empaquetados</div></div>
                <div className="stat-card card success"><div className="stat-value">{despachado}</div><div className="stat-label">Despachados</div></div>
            </div>

            <div className="card">
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Producto</th>
                                <th>Destinatario</th>
                                <th>Ciudad</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shipments.map(s => (
                                <tr key={s.id}>
                                    <td style={{ fontWeight: 600 }}>{s.product_name}</td>
                                    <td>{s.recipient_name || 'N/A'}</td>
                                    <td>{s.city || 'N/A'}, {s.province || ''}</td>
                                    <td>
                                        <select className="status-select" value={s.status}
                                            onChange={(e) => handleStatusChange(s.id, e.target.value)}>
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
        </div>
    );
}
