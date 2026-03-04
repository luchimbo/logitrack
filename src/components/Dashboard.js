"use client";

import { useState, useEffect } from "react";
import { api, toast } from "@/lib/api";
import { useBatch } from "./BatchContext";

export default function Dashboard() {
    const { getQueryString, period, specificDate } = useBatch();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            setError(null);
            try {
                const qs = getQueryString();
                const result = await api(`/dashboard?${qs}`);
                setData(result);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [period, specificDate]);

    const periodLabel = () => {
        switch (period) {
            case 'today': return 'Hoy';
            case 'date': return specificDate || 'Fecha';
            case 'week': return 'Esta semana';
            case 'month': return 'Este mes';
            case 'year': return 'Este año';
            case 'all': return 'Histórico';
            default: return '';
        }
    };

    if (loading) {
        return (
            <div className="section active">
                <div className="section-header">
                    <h1 className="section-title">📊 Dashboard</h1>
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
                    <h1 className="section-title">📊 Dashboard — {periodLabel()}</h1>
                    <p className="section-subtitle">Resumen de operaciones</p>
                </div>
                <div className="empty-state">
                    <div className="empty-state-icon">📊</div>
                    <p className="empty-state-text">Sin datos para el período seleccionado.</p>
                </div>
            </div>
        );
    }

    const statusEntries = Object.entries(data.by_status || {});
    const methodEntries = Object.entries(data.by_method || {});
    const carrierEntries = Object.entries(data.by_carrier || {}).sort((a, b) => b[1] - a[1]);
    const provinceEntries = Object.entries(data.by_province || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const maxCarrier = carrierEntries.length > 0 ? carrierEntries[0][1] : 1;
    const maxProv = provinceEntries.length > 0 ? provinceEntries[0][1] : 1;

    return (
        <div className="section active">
            <div className="section-header">
                <h1 className="section-title">📊 Dashboard — {periodLabel()}</h1>
                <p className="section-subtitle">Resumen de operaciones del período</p>
            </div>

            <div className="stats-grid">
                <div className="stat-card card accent">
                    <div className="stat-value">{data.total_packages}</div>
                    <div className="stat-label">Envíos</div>
                </div>
                <div className="stat-card card info">
                    <div className="stat-value">{data.total_units}</div>
                    <div className="stat-label">Unidades</div>
                </div>
                {statusEntries.map(([status, count]) => (
                    <div key={status} className={`stat-card card ${status === 'pendiente' ? 'warning' : status === 'despachado' ? 'success' : 'info'}`}>
                        <div className="stat-value">{count}</div>
                        <div className="stat-label">{status}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "20px" }}>
                {/* By Method */}
                <div className="card">
                    <h3 style={{ marginBottom: "16px", fontSize: "15px", fontWeight: 700 }}>📦 Por Método</h3>
                    <div className="chart-bar-container">
                        {methodEntries.map(([method, count]) => (
                            <div key={method} className="chart-bar-row">
                                <div className="chart-bar-label">{method}</div>
                                <div className="chart-bar-track">
                                    <div className={`chart-bar-fill ${method === 'flex' ? 'accent' : 'warning'}`} style={{ width: `${(count / data.total_packages * 100).toFixed(0)}%` }}>
                                        {count}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* By Carrier */}
                <div className="card">
                    <h3 style={{ marginBottom: "16px", fontSize: "15px", fontWeight: 700 }}>🚛 Por Transportista (Solo Flex)</h3>
                    {carrierEntries.length > 0 ? (
                        <div className="chart-bar-container">
                            {carrierEntries.map(([carrier, count]) => (
                                <div key={carrier} className="chart-bar-row">
                                    <div className="chart-bar-label">{carrier}</div>
                                    <div className="chart-bar-track">
                                        <div className="chart-bar-fill accent" style={{ width: `${(count / maxCarrier * 100).toFixed(0)}%` }}>
                                            {count}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>No hay envíos Flex en este período.</p>
                    )}
                </div>

                {/* By Province */}
                {provinceEntries.length > 0 && (
                    <div className="card">
                        <h3 style={{ marginBottom: "16px", fontSize: "15px", fontWeight: 700 }}>📍 Top Provincias</h3>
                        <div className="chart-bar-container">
                            {provinceEntries.map(([prov, count]) => (
                                <div key={prov} className="chart-bar-row">
                                    <div className="chart-bar-label">{prov}</div>
                                    <div className="chart-bar-track">
                                        <div className="chart-bar-fill info" style={{ width: `${(count / maxProv * 100).toFixed(0)}%` }}>
                                            {count}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
