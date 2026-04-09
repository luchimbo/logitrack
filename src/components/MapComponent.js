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
    const existingScript = document.querySelector('script[data-google-maps-loader="true"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.google.maps), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('No se pudo cargar Google Maps')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = `${GOOGLE_MAPS_SRC}?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsLoader = 'true';
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error('No se pudo cargar Google Maps'));
    document.head.appendChild(script);
  });

  return window.__googleMapsLoaderPromise;
}

function buildMarkerIcon(color) {
  const fill = color || '#3b82f6';
  return {
    path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z',
    fillColor: fill,
    fillOpacity: 1,
    strokeColor: '#111827',
    strokeWeight: 1,
    rotation: 0,
    scale: 1.8,
    anchor: new window.google.maps.Point(12, 24),
  };
}

export default function MapComponent({ view, shipments, carriers }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapElementRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowRef = useRef(null);
  const [loadError, setLoadError] = useState('');
  const configError = apiKey ? '' : 'Falta configurar NEXT_PUBLIC_GOOGLE_MAPS_API_KEY';

  const carrierMap = useMemo(() => {
    const next = new Map();
    carriers.forEach((carrier) => next.set(carrier.name, carrier));
    return next;
  }, [carriers]);

  const viewport = useMemo(() => (
    view === 'flex'
      ? { center: { lat: -34.6037, lng: -58.3816 }, zoom: 10 }
      : { center: { lat: -38.4161, lng: -63.6167 }, zoom: 5 }
  ), [view]);

  useEffect(() => {
    if (!apiKey) return;

    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !mapElementRef.current || mapInstanceRef.current) return;

        mapInstanceRef.current = new window.google.maps.Map(mapElementRef.current, {
          center: viewport.center,
          zoom: viewport.zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });

        infoWindowRef.current = new window.google.maps.InfoWindow();
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'No se pudo inicializar Google Maps');
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, viewport.center, viewport.zoom]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;

    mapInstanceRef.current.setCenter(viewport.center);
    mapInstanceRef.current.setZoom(viewport.zoom);
  }, [viewport]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.google?.maps) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    const bounds = new window.google.maps.LatLngBounds();

    shipments.forEach((shipment) => {
      const carrier = carrierMap.get(shipment.assigned_carrier);
      const marker = new window.google.maps.Marker({
        map: mapInstanceRef.current,
        position: { lat: Number(shipment.lat), lng: Number(shipment.lng) },
        title: shipment.product_name || 'Envio',
        icon: buildMarkerIcon(carrier?.color || '#ef4444'),
      });

      marker.addListener('click', () => {
        const infoHtml = `
          <div style="padding:4px 2px; min-width: 220px;">
            <h3 style="margin:0 0 4px 0; font-size:14px; font-weight:700; color:#111827;">${escapeHtml(shipment.product_name || 'Envio')}</h3>
            <p style="margin:0 0 8px 0; font-size:12px; color:#4b5563;">${escapeHtml([shipment.address, shipment.city || shipment.partido].filter(Boolean).join(', '))}</p>
            <span style="display:inline-block; padding:2px 6px; border-radius:999px; font-size:11px; font-weight:700; background:${carrier?.color ? `${carrier.color}22` : '#fecaca'}; color:${carrier?.color || '#b91c1c'};">
              ${escapeHtml(carrier?.display_name || 'No Asignado')}
            </span>
          </div>
        `;

        infoWindowRef.current?.setContent(infoHtml);
        infoWindowRef.current?.open({ map: mapInstanceRef.current, anchor: marker });
      });

      markersRef.current.push(marker);
      bounds.extend(marker.getPosition());
    });

    if (shipments.length === 1) {
      mapInstanceRef.current.setCenter(bounds.getCenter());
      mapInstanceRef.current.setZoom(13);
    } else if (shipments.length > 1) {
      mapInstanceRef.current.fitBounds(bounds, 60);
    }
  }, [carrierMap, shipments]);

  if (configError || loadError) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', color: 'var(--danger)' }}>
        {configError || loadError}
      </div>
    );
  }

  return <div ref={mapElementRef} style={{ height: '100%', width: '100%' }} />;
}
