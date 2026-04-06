"use client";

import { useState, useEffect, useCallback } from "react";
import { api, toast } from "@/lib/api";
import { useBatch } from "./BatchContext";
import { useIsMobile } from "@/hooks/useMediaQuery";
import dynamic from "next/dynamic";

// Next.js dynamic import for Leaflet because it relies on `window`
const MapWithNoSSR = dynamic(() => import("./MapComponent"), {
    ssr: false,
    loading: () => <div className="spinner"></div>
});

export default function MapSection() {
    const { getTodayQueryString } = useBatch();
    const isMobile = useIsMobile();
    const [view, setView] = useState('flex'); // 'flex' (AMBA) or 'colecta' (Argentina)
    const [shipments, setShipments] = useState([]);
    const [carriers, setCarriers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [geocodeLoading, setGeocodeLoading] = useState(false);
    const [unmappedConfig, setUnmappedConfig] = useState({ total: 0, current: 0 });

    const isWithinArgentina = (lat, lng) => {
        const latitude = Number(lat);
        const longitude = Number(lng);
        return Number.isFinite(latitude)
            && Number.isFinite(longitude)
            && latitude >= -55.2
            && latitude <= -21.5
            && longitude >= -73.7
            && longitude <= -53.5;
    };

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const qs = getTodayQueryString(view === 'flex' ? 'shipping_method=flex' : 'shipping_method=colecta');
            const [shipmentsData, carriersData] = await Promise.all([
                api(`/shipments?${qs}`),
                api('/carriers')
            ]);
            setShipments(shipmentsData);
            setCarriers(carriersData);
        } catch (err) {
            toast('Error cargando envíos en el mapa', 'error');
        } finally {
            setLoading(false);
        }
    }, [getTodayQueryString, view]);

    useEffect(() => {
        loadData();
    }, [loadData]);


    const geocodeMissing = async () => {
        if (geocodeLoading) return;
        setGeocodeLoading(true);
        try {
            // First fetch the missing ones based on current date
            const qs = getTodayQueryString();
            const { shipments: missing } = await api(`/geocode?${qs}`);

            if (!missing || missing.length === 0) {
                toast("No hay direcciones faltantes para geocodificar", "success");
                setGeocodeLoading(false);
                return;
            }

            setUnmappedConfig({ total: missing.length, current: missing.length });

            const result = await api('/geocode', {
                method: 'POST',
                body: JSON.stringify({ shipments: missing }),
            });

            toast(`¡Geocodificación finalizada! ${result.geocoded}/${result.processed} direcciones ubicadas`, "success");
            loadData(); // refresh map targets
        } catch (err) {
            toast('Error durante la geocodificación', 'error');
        } finally {
            setGeocodeLoading(false);
            setUnmappedConfig({ total: 0, current: 0 });
        }
    };


    const validShipments = shipments.filter(s => s.lat !== null && s.lng !== null && isWithinArgentina(s.lat, s.lng));
    const missingShipments = shipments.length - validShipments.length;

    return (
        <div className="section active">
            <div className="section-header flex-between mb-0">
                <div>
                    <h1 className="section-title">📍 Mapa de Entregas</h1>
                    <p className="section-subtitle">
                        {validShipments.length} ubicados en el mapa
                        {missingShipments > 0 && ` — Falta localizar ${missingShipments} direcciones`}
                    </p>
                </div>
                {missingShipments > 0 && (
                    <button
                        className="btn btn-primary"
                        onClick={geocodeMissing}
                        disabled={geocodeLoading}
                        style={{ display: "flex", alignItems: "center", gap: "8px" }}
                    >
                        {geocodeLoading ? (
                            <>⏳ Optimizando ({unmappedConfig.current}/{unmappedConfig.total})</>
                        ) : (
                            <>📍 Localizar {missingShipments} faltantes</>
                        )}
                    </button>
                )}
            </div>

            <div className="map-tabs" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button
                    onClick={() => setView('flex')}
                    className={`btn btn-sm ${view === 'flex' ? 'btn-primary' : ''}`}
                    style={view !== 'flex' ? { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' } : {}}
                >
                    🚀 Mapa Flex (AMBA)
                </button>
                <button
                    onClick={() => setView('colecta')}
                    className={`btn btn-sm ${view === 'colecta' ? 'btn-primary' : ''}`}
                    style={view !== 'colecta' ? { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' } : {}}
                >
                    📦 Mapa Colecta (Nacional)
                </button>
            </div>

            <div style={{ height: isMobile ? "400px" : "600px", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--border)" }}>
                {loading ? (
                    <div className="spinner" style={{ margin: "20% auto" }}></div>
                ) : (
                    <MapWithNoSSR view={view} shipments={validShipments} carriers={carriers} />
                )}
            </div>
        </div>
    );
}
