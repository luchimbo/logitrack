import { useEffect, useMemo, useRef, useState } from 'react';

const GOOGLE_MAPS_SRC = 'https://maps.googleapis.com/maps/api/js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function loadGoogleMaps(apiKey) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps solo esta disponible en cliente'));
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }

  if (window.__googleMapsLoaderPromise) {
    return window.__googleMapsLoaderPromise;
  }

  window.__googleMapsLoaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${GOOGLE_MAPS_SRC}?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error('No se pudo cargar Google Maps'));
    document.head.appendChild(script);
  });

  return window.__googleMapsLoaderPromise;
}

function getViewport(view) {
  return view === 'flex'
    ? { center: { lat: -34.6037, lng: -58.3816 }, zoom: 9, maxFitZoom: 12 }
    : { center: { lat: -38.4161, lng: -63.6167 }, zoom: 4, maxFitZoom: 7 };
}

function buildMarkerIcon(color) {
  return {
    path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z',
    fillColor: color || '#818cf8',
    fillOpacity: 1,
    strokeColor: '#0f172a',
    strokeWeight: 1,
    scale: 1.8,
    anchor: new window.google.maps.Point(12, 24),
  };
}

function getShipmentBadge(shipment, carrier) {
  if (shipment.shipping_method === 'colecta') {
    return {
      label: 'Colecta',
      background: 'rgba(96, 165, 250, 0.18)',
      color: '#60a5fa',
    };
  }

  if (carrier?.display_name || shipment.assigned_carrier) {
    return {
      label: carrier?.display_name || shipment.assigned_carrier,
      background: carrier?.color ? `${carrier.color}22` : '#fecaca',
      color: carrier?.color || '#b91c1c',
    };
  }

  return {
    label: 'No asignado',
    background: '#fecaca',
    color: '#b91c1c',
  };
}

export default function MapComponent({ view, shipments, carriers }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null);
  const renderedKeyRef = useRef('');
  const [loadError, setLoadError] = useState('');

  const carrierMap = useMemo(() => {
    const map = new Map();
    carriers.forEach((carrier) => map.set(carrier.name, carrier));
    return map;
  }, [carriers]);

  const shipmentsKey = useMemo(
    () => shipments.map((shipment) => `${shipment.id}:${shipment.lat}:${shipment.lng}:${shipment.assigned_carrier || ''}`).join('|'),
    [shipments],
  );

  useEffect(() => {
    if (!apiKey || mapRef.current) return;

    let cancelled = false;
    const viewport = getViewport(view);

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !mapElementRef.current || mapRef.current) return;

        mapRef.current = new window.google.maps.Map(mapElementRef.current, {
          center: viewport.center,
          zoom: viewport.zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
          draggableCursor: 'grab',
        });

        infoWindowRef.current = new window.google.maps.InfoWindow();
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error.message || 'No se pudo inicializar Google Maps');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, view]);

  useEffect(() => {
    if (!mapRef.current) return;

    const viewport = getViewport(view);
    mapRef.current.setCenter(viewport.center);
    mapRef.current.setZoom(viewport.zoom);
    renderedKeyRef.current = '';
  }, [view]);

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;
    if (renderedKeyRef.current === `${view}|${shipmentsKey}`) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    const viewport = getViewport(view);

    if (shipments.length === 0) {
      mapRef.current.setCenter(viewport.center);
      mapRef.current.setZoom(viewport.zoom);
      renderedKeyRef.current = `${view}|${shipmentsKey}`;
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();

    shipments.forEach((shipment) => {
      const carrier = carrierMap.get(shipment.assigned_carrier);
      const badge = getShipmentBadge(shipment, carrier);
      const marker = new window.google.maps.Marker({
        map: mapRef.current,
        position: { lat: Number(shipment.lat), lng: Number(shipment.lng) },
        title: shipment.product_name || 'Envio',
        icon: buildMarkerIcon(carrier?.color || '#ef4444'),
      });

      marker.addListener('click', () => {
        infoWindowRef.current?.setContent(`
          <div style="padding:4px 2px;min-width:220px;">
            <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:4px;">${escapeHtml(shipment.product_name || 'Envio')}</div>
            <div style="font-size:12px;color:#475569;margin-bottom:8px;">${escapeHtml([shipment.address, shipment.city || shipment.partido, shipment.province].filter(Boolean).join(', '))}</div>
            <div style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:${badge.background};color:${badge.color};">
              ${escapeHtml(badge.label)}
            </div>
          </div>
        `);
        infoWindowRef.current?.open({ map: mapRef.current, anchor: marker });
      });

      markersRef.current.push(marker);
      bounds.extend(marker.getPosition());
    });

    if (shipments.length === 1) {
      mapRef.current.setCenter(bounds.getCenter());
      mapRef.current.setZoom(Math.min(viewport.maxFitZoom, 13));
    } else {
      mapRef.current.fitBounds(bounds, 60);
      window.google.maps.event.addListenerOnce(mapRef.current, 'idle', () => {
        if (mapRef.current && mapRef.current.getZoom() > viewport.maxFitZoom) {
          mapRef.current.setZoom(viewport.maxFitZoom);
        }
      });
    }

    renderedKeyRef.current = `${view}|${shipmentsKey}`;
  }, [carrierMap, shipments, shipmentsKey, view]);

  if (!apiKey || loadError) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', color: 'var(--danger)' }}>
        {loadError || 'Falta configurar NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'}
      </div>
    );
  }

  return <div ref={mapElementRef} style={{ height: '100%', width: '100%' }} />;
}
