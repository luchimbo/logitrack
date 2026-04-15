"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useBatch } from "./BatchContext";
import { useIsMobile } from "@/hooks/useMediaQuery";

export default function Dashboard() {
    const { getQueryString, period, setPeriod, specificDate, setSpecificDate, rangeFrom, setRangeFrom, rangeTo, setRangeTo } = useBatch();
    const [data, setData] = useState(null);
    const [shipments, setShipments] = useState([]);
    const [showShipments, setShowShipments] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [draftSpecificDate, setDraftSpecificDate] = useState(specificDate);
    const [appliedSpecificDate, setAppliedSpecificDate] = useState(specificDate);
    const [draftRangeFrom, setDraftRangeFrom] = useState(rangeFrom);
    const [draftRangeTo, setDraftRangeTo] = useState(rangeTo);
    const [appliedRangeFrom, setAppliedRangeFrom] = useState(rangeFrom);
    const [appliedRangeTo, setAppliedRangeTo] = useState(rangeTo);
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
        setDraftSpecificDate(specificDate);
        setAppliedSpecificDate(specificDate);
        setDraftRangeFrom(rangeFrom);
        setDraftRangeTo(rangeTo);
        setAppliedRangeFrom(rangeFrom);
        setAppliedRangeTo(rangeTo);
    }, [specificDate, rangeFrom, rangeTo]);

    const isRangeIncomplete = period === 'range' && (!appliedRangeFrom || !appliedRangeTo);
    const isDateIncomplete = period === 'date' && !appliedSpecificDate;
    const isDraftRangeIncomplete = !draftRangeFrom || !draftRangeTo;

    const getComparisonMeta = () => {
        switch (period) {
            case 'today':
                return {
                    title: 'Hoy vs Ayer',
                    currentLabel: 'Hoy',
                    previousLabel: 'Ayer',
                    description: 'Compara la actividad cargada hoy contra el día anterior.',
                };
            case 'week':
                return {
                    title: 'Esta semana vs Semana anterior',
                    currentLabel: 'Esta semana',
                    previousLabel: 'Semana anterior',
                    description: 'Mide si el ritmo operativo semanal sube o baja frente a la semana previa.',
                };
            case 'month':
                return {
                    title: 'Este mes vs Mes anterior',
                    currentLabel: 'Este mes',
                    previousLabel: 'Mes anterior',
                    description: 'Compara volumen y mix operativo del mes actual contra el mes pasado.',
                };
            default:
                return null;
        }
    };

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
                <div style={{ display: 'grid', gap: '8px', width: '100%', marginTop: '8px' }}>
                    <input
                        type="date"
                        className="form-input"
                        style={{ 
                            width: '100%', 
                            padding: '10px',
                            fontSize: '16px'
                        }}
                        value={draftSpecificDate}
                        onChange={(e) => setDraftSpecificDate(e.target.value)}
                        max={new Date().toISOString().slice(0, 10)}
                    />
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!draftSpecificDate}
                        onClick={() => {
                            setAppliedSpecificDate(draftSpecificDate);
                            setSpecificDate(draftSpecificDate);
                        }}
                        style={{ whiteSpace: 'nowrap', justifySelf: isMobile ? 'stretch' : 'start' }}
                    >
                        Aplicar
                    </button>
                </div>
            )}

            {period === 'range' && (
                <div style={{ display: 'grid', gap: '8px', width: '100%', marginTop: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px', width: '100%', flexDirection: isMobile ? 'column' : 'row' }}>
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
                    </div>
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={isDraftRangeIncomplete}
                        onClick={() => {
                            setAppliedRangeFrom(draftRangeFrom);
                            setAppliedRangeTo(draftRangeTo);
                            setRangeFrom(draftRangeFrom);
                            setRangeTo(draftRangeTo);
                        }}
                        style={{ whiteSpace: 'nowrap', justifySelf: isMobile ? 'stretch' : 'start' }}
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
                const [result, shipmentsData] = await Promise.all([
                    api(`/dashboard?${qs}`),
                    api(`/shipments?${qs}`)
                ]);
                setData(result);
                setShipments(shipmentsData);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [getQueryString, isRangeIncomplete]);

    const periodLabel = () => {
        switch (period) {
            case 'today': return 'Hoy';
            case 'date': return appliedSpecificDate || 'Fecha';
            case 'range': {
                const from = appliedRangeFrom || '...';
                const to = appliedRangeTo || '...';
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

    if (isDateIncomplete || isRangeIncomplete) {
        return (
            <div className="section active">
                <div className="section-header">
                    <h1 className="section-title">📊 Dashboard — {periodLabel()}</h1>
                    <p className="section-subtitle">Resumen de operaciones del período</p>
                    {renderPeriodPicker()}
                </div>
                <div className="card">
                    <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
                        {period === 'date'
                            ? 'Seleccioná una fecha y tocá Aplicar para consultar.'
                            : 'Seleccioná ambas fechas para consultar el rango.'}
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
                    <p className="empty-state-text">Sin datos para el período seleccionado.<br />Probá cambiar el rango o cargar nuevas etiquetas para ver actividad.</p>
                </div>
            </div>
        );
    }

    const statusEntries = Object.entries(data.by_status || {}).filter(([status]) => String(status || '').toLowerCase() !== 'pendiente');
    const methodEntries = Object.entries(data.by_method || {});
    const carrierEntries = Object.entries(data.by_carrier || {}).sort((a, b) => b[1] - a[1]);
    const provinceEntries = Object.entries(data.by_province || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const topDays = data.daily_rankings?.top_days || [];
    const lowDays = data.daily_rankings?.low_days || [];
    const comparison = data.comparison;
    const comparisonMeta = comparison ? getComparisonMeta() : null;

    const maxCarrier = carrierEntries.length > 0 ? carrierEntries[0][1] : 1;
    const maxProv = provinceEntries.length > 0 ? provinceEntries[0][1] : 1;

    return (
        <div className="section active">
            <div className="section-header">
                <h1 className="section-title">📊 Dashboard — {periodLabel()}</h1>
                <p className="section-subtitle">Resumen de operaciones del período</p>
                {renderPeriodPicker()}
            </div>

            {comparison && comparisonMeta && (
                <div className="card" style={{ marginBottom: '20px', padding: isMobile ? '16px' : '18px 20px' }}>
                    <div className="flex-between" style={{ gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '6px' }}>
                                Comparativa activa
                            </div>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)', marginBottom: '6px' }}>
                                {comparisonMeta.title}
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.6 }}>
                                {comparisonMeta.description}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <span className="topbar-chip">{comparisonMeta.currentLabel}</span>
                            <span className="topbar-chip subtle">vs</span>
                            <span className="topbar-chip">{comparisonMeta.previousLabel}</span>
                        </div>
                    </div>
                </div>
            )}

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
                                        <div className={`chart-bar-fill ${method === 'flex' ? 'accent' : method === 'zipnova' ? 'info' : 'warning'}`} style={{ width: `${(count / data.total_packages * 100).toFixed(0)}%` }}>
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

                {comparison && ['today', 'week', 'month'].includes(period) && (
                    <div className="card">
                        <h3 style={{ marginBottom: "16px", fontSize: "15px", fontWeight: 700 }}>📈 Comparativa</h3>
                        <div style={{ display: 'grid', gap: '10px' }}>
                            {[
                                { label: 'Envíos', current: data.total_packages, previous: comparison.previous.total_packages, delta: comparison.delta.total_packages },
                                { label: 'Unidades', current: data.total_units, previous: comparison.previous.total_units, delta: comparison.delta.total_units },
                                { label: 'Flex', current: data.by_method.flex || 0, previous: comparison.previous.by_method.flex || 0, delta: comparison.delta.flex },
                                { label: 'Colecta', current: data.by_method.colecta || 0, previous: comparison.previous.by_method.colecta || 0, delta: comparison.delta.colecta },
                                { label: 'Zipnova', current: data.by_method.zipnova || 0, previous: comparison.previous.by_method.zipnova || 0, delta: comparison.delta.zipnova || 0 },
                            ].map((item) => (
                                <div key={item.label} className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
                                    <div className="mobile-card-title">{item.label}</div>
                                    <div className="mobile-card-body" style={{ marginTop: '8px' }}>
                                        <div className="mobile-card-row"><span className="mobile-card-label">{comparisonMeta?.currentLabel || 'Actual'}</span><span className="mobile-card-value">{item.current}</span></div>
                                        <div className="mobile-card-row"><span className="mobile-card-label">{comparisonMeta?.previousLabel || 'Anterior'}</span><span className="mobile-card-value">{item.previous}</span></div>
                                        <div className="mobile-card-row"><span className="mobile-card-label">Variación</span><span className="mobile-card-value" style={{ color: item.delta > 0 ? 'var(--success)' : item.delta < 0 ? 'var(--danger)' : 'var(--text)' }}>{item.delta > 0 ? '+' : ''}{item.delta}%</span></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {period === 'range' && topDays.length > 0 && (
                    <div className="card">
                        <h3 style={{ marginBottom: "16px", fontSize: "15px", fontWeight: 700 }}>🔥 Días con más envíos</h3>
                        <div style={{ display: 'grid', gap: '10px' }}>
                            {topDays.map((day) => (
                                <div key={`top-${day.date}`} className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
                                    <div className="mobile-card-title">{day.date}</div>
                                    <div className="mobile-card-body" style={{ marginTop: '8px' }}>
                                        <div className="mobile-card-row"><span className="mobile-card-label">Total</span><span className="mobile-card-value">{day.total}</span></div>
                                        <div className="mobile-card-row"><span className="mobile-card-label">Colecta</span><span className="mobile-card-value">{day.colecta}</span></div>
                                        <div className="mobile-card-row"><span className="mobile-card-label">Flex</span><span className="mobile-card-value">{day.flex}</span></div>
                                        <div className="mobile-card-row"><span className="mobile-card-label">Zipnova</span><span className="mobile-card-value">{day.zipnova || 0}</span></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {period === 'range' && lowDays.length > 0 && (
                    <div className="card">
                        <h3 style={{ marginBottom: "16px", fontSize: "15px", fontWeight: 700 }}>🧊 Días con menos envíos</h3>
                        <div style={{ display: 'grid', gap: '10px' }}>
                            {lowDays.map((day) => (
                                <div key={`low-${day.date}`} className="mobile-card" style={{ display: 'block', marginBottom: 0 }}>
                                    <div className="mobile-card-title">{day.date}</div>
                                    <div className="mobile-card-body" style={{ marginTop: '8px' }}>
                                        <div className="mobile-card-row"><span className="mobile-card-label">Total</span><span className="mobile-card-value">{day.total}</span></div>
                                        <div className="mobile-card-row"><span className="mobile-card-label">Colecta</span><span className="mobile-card-value">{day.colecta}</span></div>
                                        <div className="mobile-card-row"><span className="mobile-card-label">Flex</span><span className="mobile-card-value">{day.flex}</span></div>
                                        <div className="mobile-card-row"><span className="mobile-card-label">Zipnova</span><span className="mobile-card-value">{day.zipnova || 0}</span></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {shipments.length > 0 && (
                    <div className="card" style={{ marginTop: '20px' }}>
                        <button
                            onClick={() => setShowShipments(v => !v)}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: 'transparent',
                                border: 'none',
                                padding: '0',
                                cursor: 'pointer',
                                fontSize: '15px',
                                fontWeight: 700,
                                color: 'var(--text)'
                            }}
                        >
                            <span>📦 Envíos del período ({shipments.length})</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                {showShipments ? '▲ Ocultar' : '▼ Ver'}
                            </span>
                        </button>

                        {showShipments && (
                            <>
                                {/* Desktop Table */}
                                <div className="table-container" style={{ marginTop: '16px' }}>
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Producto</th>
                                                <th>Destinatario</th>
                                                <th>Destino</th>
                                                <th>Método</th>
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
                                                        <span className="badge" style={{
                                                            background: s.shipping_method === 'flex' ? 'var(--accent-light)' : s.shipping_method === 'colecta' ? 'var(--warning-bg)' : 'var(--info-bg)',
                                                            color: s.shipping_method === 'flex' ? 'var(--accent)' : s.shipping_method === 'colecta' ? 'var(--warning)' : 'var(--info)'
                                                        }}>
                                                            {s.shipping_method || '—'}
                                                        </span>
                                                    </td>
                                                    <td>{s.status || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile Cards */}
                                <div className="mobile-cards-container" style={{ marginTop: '16px' }}>
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
                                                    <span className="mobile-card-label">Destino</span>
                                                    <span className="mobile-card-value">{s.city || 'N/A'}, {s.province || ''}</span>
                                                </div>
                                                <div className="mobile-card-row">
                                                    <span className="mobile-card-label">Método</span>
                                                    <span className="mobile-card-value">
                                                        <span className="badge" style={{
                                                            background: s.shipping_method === 'flex' ? 'var(--accent-light)' : s.shipping_method === 'colecta' ? 'var(--warning-bg)' : 'var(--info-bg)',
                                                            color: s.shipping_method === 'flex' ? 'var(--accent)' : s.shipping_method === 'colecta' ? 'var(--warning)' : 'var(--info)'
                                                        }}>
                                                            {s.shipping_method || '—'}
                                                        </span>
                                                    </span>
                                                </div>
                                                <div className="mobile-card-row">
                                                    <span className="mobile-card-label">Estado</span>
                                                    <span className="mobile-card-value">{s.status || '—'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
