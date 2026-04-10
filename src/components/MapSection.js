"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { api, toast } from "@/lib/api";
import { useBatch } from "./BatchContext";
import { useIsMobile } from "@/hooks/useMediaQuery";

const MapWithNoSSR = dynamic(() => import("./MapComponent"), {
  ssr: false,
  loading: () => <div className="spinner"></div>,
});

function isWithinArgentina(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -55.2
    && latitude <= -21.5
    && longitude >= -73.7
    && longitude <= -53.5;
}

export default function MapSection() {
  const { getTodayQueryString } = useBatch();
  const isMobile = useIsMobile();
  const [view, setView] = useState("flex");
  const [shipments, setShipments] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [geocodeLoading, setGeocodeLoading] = useState(false);
  const [unmappedCount, setUnmappedCount] = useState(0);
  const autoGeocodeKeyRef = useRef("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = getTodayQueryString(view === "flex" ? "shipping_method=flex" : "shipping_method=colecta");
      const [shipmentsData, carriersData] = await Promise.all([
        api(`/shipments?${qs}`),
        api("/carriers"),
      ]);
      setShipments(Array.isArray(shipmentsData) ? shipmentsData : []);
      setCarriers(Array.isArray(carriersData) ? carriersData : []);
    } catch (error) {
      toast("Error cargando envios en el mapa", "error");
    } finally {
      setLoading(false);
    }
  }, [getTodayQueryString, view]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const geocodableShipments = useMemo(
    () => shipments.filter((shipment) => shipment.lat === null || shipment.lng === null || !isWithinArgentina(shipment.lat, shipment.lng)),
    [shipments],
  );

  const mappedShipments = useMemo(
    () => shipments.filter((shipment) => shipment.lat !== null && shipment.lng !== null && isWithinArgentina(shipment.lat, shipment.lng)),
    [shipments],
  );

  useEffect(() => {
    setUnmappedCount(geocodableShipments.length);
  }, [geocodableShipments.length]);

  const geocodeMissing = useCallback(async () => {
    if (geocodeLoading || geocodableShipments.length === 0) return;

    setGeocodeLoading(true);
    try {
      const result = await api("/geocode", {
        method: "POST",
        body: JSON.stringify({ shipments: geocodableShipments }),
      });
      toast(`Geocodificacion finalizada: ${result.geocoded}/${result.processed}`, "success");
      await loadData();
    } catch (error) {
      toast("Error durante la geocodificacion", "error");
    } finally {
      setGeocodeLoading(false);
    }
  }, [geocodableShipments, geocodeLoading, loadData]);

  useEffect(() => {
    if (loading || geocodeLoading || geocodableShipments.length === 0) return;

    const key = `${view}:${geocodableShipments.map((shipment) => shipment.id).join(",")}`;
    if (autoGeocodeKeyRef.current === key) return;

    autoGeocodeKeyRef.current = key;
    geocodeMissing();
  }, [geocodableShipments, geocodeLoading, geocodeMissing, loading, view]);

  return (
    <div className="section active">
      <div className="section-header flex-between mb-0" style={{ gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h1 className="section-title">📍 Mapa de Entregas</h1>
          <p className="section-subtitle">
            {view === "flex" ? "Flex para AMBA" : "Colecta para toda Argentina"}
            {mappedShipments.length > 0 ? ` · ${mappedShipments.length} envios ubicados` : " · Sin envios ubicados"}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {unmappedCount > 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>
              {geocodeLoading ? `Localizando ${unmappedCount} direcciones...` : `${unmappedCount} direcciones pendientes de ubicar`}
            </div>
          ) : null}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={loadData}
            disabled={loading || geocodeLoading}
          >
            Actualizar
          </button>
          {unmappedCount > 0 ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={geocodeMissing}
              disabled={geocodeLoading}
            >
              {geocodeLoading ? "Localizando..." : "Localizar ahora"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="map-tabs" style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button
          type="button"
          onClick={() => setView("flex")}
          className={`btn btn-sm ${view === "flex" ? "btn-primary" : "btn-ghost"}`}
        >
          🚀 Flex AMBA
        </button>
        <button
          type="button"
          onClick={() => setView("colecta")}
          className={`btn btn-sm ${view === "colecta" ? "btn-primary" : "btn-ghost"}`}
        >
          📦 Colecta Argentina
        </button>
      </div>

      <div style={{ height: isMobile ? "420px" : "640px", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface)" }}>
        {loading ? (
          <div className="spinner" style={{ margin: "20% auto" }}></div>
        ) : (
          <MapWithNoSSR view={view} shipments={mappedShipments} carriers={carriers} />
        )}
      </div>
    </div>
  );
}
