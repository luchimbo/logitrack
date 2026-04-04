"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useBatch } from "./BatchContext";
import { useIsMobile } from "@/hooks/useMediaQuery";

export default function Dashboard() {
    const { getQueryString, period, setPeriod, specificDate, setSpecificDate, rangeFrom, setRangeFrom, rangeTo, setRangeTo } = useBatch();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [draftRangeFrom, setDraftRangeFrom] = useState(rangeFrom);
    const [draftRangeTo, setDraftRangeTo] = useState(rangeTo);
    const isMobile = useIsMobile();

    const PERIODS = [
        { id: 'today', label: 'Hoy', icon: '📅' },
        { id: 'date', label: 'Fecha', icon: '🗓️' },
        { id: 'range', label: 'Rango', icon: '🧭' },
        { id: 'week', label: 'Semana', icon: '📆' },
        { id: 'month', label: 'Mes', icon: '📊' },
        { id: 'year', label: 'Año', icon: '📈' },
        { id: 'all', label: 'Todo', icon: '🗃️' },
    ];

    useEffect(() => {
        setDraftRangeFrom(rangeFrom);
        setDraftRangeTo(rangeTo);
    }, [rangeFrom, rangeTo]);

    const isRangeIncomplete = period === 'range' && (!rangeFrom || !rangeTo);
    const isDraftRangeIncomplete = !draftRangeFrom || !draftRangeTo;

    const renderPeriodPicker = () => (
        <div style={{ 
            marginTop: '16px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: isMobile ? '6px' : '8px',
            background: 'var(--bg-secondary)',
            padding: isMobile ? '8px' : '10px',
            borderRadius: '12px',
            border: '1px solid var(--border)'
        }}>
            {PERIODS.map((p) => (
                <button
                    key={p.id}
                    onClick={() => setPeriod(p.id)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: isMobile ? '6px 10px' : '8px 12px',
                        borderRadius: '8px',
                        border: 'none',
                        background: period === p.id ? 'var(--accent)' : 'var(--surface)',
                        color: period === p.id ? 'white' : 'var(--text)',
                        fontSize: isMobile ? '12px' : '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        flex: isMobile ? '1 1 calc(50% - 6px)' : '0 0 auto',
                        justifyContent: 'center',
                        minWidth: isMobile ? '60px' : '88px'
                    }}
                >
                    <span style={{ fontSize: '14px' }}>{p.icon}</span>
                    <span>{p.label}</span>
                </button>
            ))}

            {period === 'date' && (
                <input
                    type="date"
                    className="form-input"
                    style={{ 
                        width: '100%', 
                        marginTop: '8px',
                        padding: '10px',
                        fontSize: '16px'
                    }}
                    value={specificDate}
                    onChange={(e) => setSpecificDate(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                />
            )}

            {period === 'range' && (
                <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '8px', flexDirection: isMobile ? 'column' : 'row' }}>
                    <input
                        type="date"
                        className="form-input"
                        style={{ flex: 1, padding: '10px', fontSize: '16px' }}
                        value={draftRangeFrom}
                        onChange={(e) => setDraftRangeFrom(e.target.value)}
                        max={new Date().toISOString().slice(0, 10)}
                    />
                    <input
                        type="date"
                        className="form-input"
                        style={{ flex: 1, padding: '10px', fontSize: '16px' }}
                        value={draftRangeTo}
                        onChange={(e) => setDraftRangeTo(e.target.value)}
                        max={new Date().toISOString().slice(0, 10)}
                    />
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={isDraftRangeIncomplete}
                        onClick={() => {
                            setRangeFrom(draftRangeFrom);
                            setRangeTo(draftRangeTo);
                        }}
                        style={{ whiteSpace: 'nowrap' }}
                    >
                        Aplicar
                    </button>
                </div>
            )}
        </div>
    );

    useEffect(() => {
        async function fetchData() {
            if (isRangeIncomplete) {
                setLoading(false);
                setError(null);
                setData(null);
                return;
            }

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
    }, [period, specificDate, rangeFrom, rangeTo, isRangeIncomplete]);

    const periodLabel = () => {
        switch (period) {
            case 'today': return 'Hoy';
            case 'date': return specificDate || 'Fecha';
            case 'range': {
                const from = rangeFrom || '...';
                const to = rangeTo || '...';
                return `${from} a ${to}`;
            }
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
                {renderPeriodPicker()}
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
                {renderPeriodPicker()}
            </div>
            <p style={{ color: "var(--danger)" }}>Error: {error}</p>
        </div>
    );
}

    if (isRangeIncomplete) {
        return (
            <div className="section active">
                <div className="section-header">
                    <h1 className="section-title">📊 Dashboard — {periodLabel()}</h1>
                    <p className="section-subtitle">Resumen de operaciones del período</p>
                    {renderPeriodPicker()}
                </div>
                <div className="card">
                    <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
                        Seleccioná ambas fechas para consultar el rango.
                    </p>
                </div>
            </div>
        );
    }

    if (!data || data.total_packages === 0) {
        return (
            <div className="section active">
                <div className="section-header">
                    <h1 className="section-title">📊 Dashboard — {periodLabel()}</h1>
                    <p className="section-subtitle">Resumen de operaciones</p>
                    {renderPeriodPicker()}
                </div>
                <div className="empty-state">
                    <div className="empty-state-icon">📊</div>
                    <p className="empty-state-text">Sin datos para el período seleccionado.</p>
                </div>
            </div>
        );
    }

    const statusEntries = Object.entries(data.by_status || {}).filter(([status]) => String(status || '').toLowerCase() !== 'pendiente');
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
                {renderPeriodPicker()}
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

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(400px, 1fr))", gap: "20px" }}>
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
