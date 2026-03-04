"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useBatch } from "./BatchContext";

export default function Dashboard() {
    const { currentBatchId } = useBatch();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchData() {
            if (!currentBatchId) {
                setData(null);
                return;
            }
            setLoading(true);
            setError(null);
            try {
                const result = await api(`/dashboard?batch_id=${currentBatchId}`);
                setData(result);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [currentBatchId]);

    if (loading) {
        return (
            <div className="section active">
                <div className="section-header">
                    <h1 className="section-title">📊 Dashboard</h1>
                    <p className="section-subtitle">Resumen del día</p>
                </div>
                <div className="spinner"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="section active">
                <div className="section-header">
                    <h1 className="section-title">📊 Dashboard</h1>
                </div>
                <p style={{ color: "var(--danger)" }}>Error: {error}</p>
            </div>
        );
    }

    if (!data || data.total_packages === 0) {
        return (
            <div className="section active">
                <div className="section-header">
                    <h1 className="section-title">📊 Dashboard</h1>
                    <p className="section-subtitle">Resumen del día</p>
                </div>
                <div className="empty-state">
                    <div className="empty-state-icon">📊</div>
                    <p className="empty-state-text">No hay datos para mostrar.<br />Subí etiquetas para ver el dashboard.</p>
                </div>
            </div>
        );
    }

    const colectaCount = data.by_method?.colecta || 0;
    const flexCount = data.by_method?.flex || 0;

    const statusOrder = ['pendiente', 'encontrado', 'empaquetado', 'despachado'];
    const statusColors = { pendiente: 'warning', encontrado: 'info', empaquetado: 'accent', despachado: 'success' };
    const statusIcons = { pendiente: '🕒', encontrado: '🔍', empaquetado: '📦', despachado: '✅' };

    return (
        <div className="section active">
            <div className="section-header">
                <h1 className="section-title">📊 Dashboard</h1>
                <p className="section-subtitle">Resumen del día — {new Date().toLocaleDateString('es-AR')}</p>
            </div>

            <div className="stats-grid">
                <div className="stat-card card accent">
                    <div className="stat-value">{data.total_packages}</div>
                    <div className="stat-label">Total Paquetes</div>
                </div>
                <div className="stat-card card info">
                    <div className="stat-value">{data.total_units}</div>
                    <div className="stat-label">Total Unidades</div>
                </div>
                <div className="stat-card card warning">
                    <div className="stat-value">{colectaCount}</div>
                    <div className="stat-label">📦 Colecta</div>
                </div>
                <div className="stat-card card success">
                    <div className="stat-value">{flexCount}</div>
                    <div className="stat-label">🚀 Flex</div>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                {/* COLECTA Section */}
                <div className="card" style={{ borderTop: "3px solid #f59e0b" }}>
                    <h3 style={{ marginBottom: "16px", fontSize: "16px", fontWeight: 700 }}>📦 Colecta — {colectaCount} paquetes</h3>
                    {colectaCount > 0 ? (
                        <div className="chart-bar-container">
                            {Object.entries(data.by_carrier || {})
                                .filter(([name]) => name !== 'Sin asignar' || colectaCount > 0)
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 8)
                                .map(([carrier, count], i) => {
                                    const pct = data.total_packages > 0 ? (count / data.total_packages * 100) : 0;
                                    const colors = ['warning', 'info', 'success', 'accent', 'danger'];
                                    return (
                                        <div className="chart-bar-row" key={carrier}>
                                            <div className="chart-bar-label">🚛 {carrier}</div>
                                            <div className="chart-bar-track">
                                                <div className={`chart-bar-fill ${colors[i % colors.length]}`} style={{ width: `${Math.max(pct, 3)}%` }}>{count}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    ) : (
                        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>No hay envíos colecta</p>
                    )}
                </div>

                {/* FLEX Section */}
                <div className="card" style={{ borderTop: "3px solid var(--accent)" }}>
                    <h3 style={{ marginBottom: "16px", fontSize: "16px", fontWeight: 700 }}>🚀 Flex — {flexCount} paquetes</h3>
                    {flexCount > 0 ? (
                        <div className="chart-bar-container">
                            {Object.entries(data.by_carrier || {})
                                .filter(([name]) => flexCount > 0)
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 8)
                                .map(([carrier, count], i) => {
                                    if (data.by_method.colecta && carrier !== "Sin asignar" && Object.keys(data.by_carrier).length > Object.keys(data.by_method).length) {
                                        return null; // Crude filter, normally backend separates flex vs colecta carriers better
                                    }
                                    const pct = data.total_packages > 0 ? (count / data.total_packages * 100) : 0;
                                    const colors = ['accent', 'danger', 'success', 'info', 'warning'];
                                    return (
                                        <div className="chart-bar-row" key={carrier}>
                                            <div className="chart-bar-label">🏍️ {carrier}</div>
                                            <div className="chart-bar-track">
                                                <div className={`chart-bar-fill ${colors[i % colors.length]}`} style={{ width: `${Math.max(pct, 3)}%` }}>{count}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    ) : (
                        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>No hay envíos flex</p>
                    )}
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "20px" }}>
                <div className="card">
                    <h3 style={{ marginBottom: "20px", fontSize: "16px", fontWeight: 700 }}>Estado de Envíos</h3>
                    <div className="chart-bar-container">
                        {statusOrder.map(status => {
                            const count = data.by_status?.[status] || 0;
                            const pct = data.total_packages > 0 ? (count / data.total_packages * 100) : 0;
                            return (
                                <div className="chart-bar-row" key={status}>
                                    <div className="chart-bar-label">{statusIcons[status]} {status}</div>
                                    <div className="chart-bar-track">
                                        <div className={`chart-bar-fill ${statusColors[status]}`} style={{ width: `${Math.max(pct, 2)}%` }}>{count}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="card">
                    <h3 style={{ marginBottom: "20px", fontSize: "16px", fontWeight: 700 }}>Por Provincia</h3>
                    <div className="chart-bar-container">
                        {Object.entries(data.by_province || {})
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 10)
                            .map(([prov, count], i) => {
                                const pct = data.total_packages > 0 ? (count / data.total_packages * 100) : 0;
                                const colors = ['accent', 'info', 'success', 'warning', 'danger'];
                                return (
                                    <div className="chart-bar-row" key={prov}>
                                        <div className="chart-bar-label">{prov}</div>
                                        <div className="chart-bar-track">
                                            <div className={`chart-bar-fill ${colors[i % colors.length]}`} style={{ width: `${Math.max(pct, 2)}%` }}>{count}</div>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            </div>
        </div>
    );
}
