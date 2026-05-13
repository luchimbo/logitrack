"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

const providerAccent = {
  shopify: '#22c55e',
  tiendanube: '#2563eb',
  mercadolibre: '#facc15',
  zipnova: '#f97316',
  correo_argentino: '#facc15',
};

const providerIcon = {
  shopify: 'S',
  tiendanube: 'TN',
  mercadolibre: 'ML',
  zipnova: 'Z',
  correo_argentino: 'CA',
};

const providerLogo = {
  shopify: '/LogoShopify.png',
  tiendanube: '/LogoTiendaNube.png',
  mercadolibre: '/LogoMercadoLibre.png',
  zipnova: '/LogoZipnova.png',
  correo_argentino: '/LogoCorreoArgentino.jpg',
};

function formatDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function IntegrationCard({ integration, connections, onOpenProvider }) {
  const accent = providerAccent[integration.provider] || 'var(--accent)';
  const isComingSoon = integration.status === 'coming_soon';
  const isConnected = Boolean(integration.connected);

  return (
    <article className="card" style={{ padding: 0, overflow: 'hidden', border: `1px solid ${isConnected ? `${accent}55` : 'var(--border)'}` }}>
      <div style={{ padding: '18px', display: 'grid', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '12px', minWidth: 0 }}>
            <div style={{ width: '54px', height: '54px', flex: '0 0 54px', borderRadius: '16px', display: 'grid', placeItems: 'center', background: '#ffffff', color: accent, fontWeight: 900, border: `1px solid ${accent}35`, padding: '6px' }}>
              {providerLogo[integration.provider] ? (
                <Image
                  src={providerLogo[integration.provider]}
                  alt={`${integration.name} logo`}
                  width={42}
                  height={42}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : providerIcon[integration.provider] || integration.name[0]}
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: '18px', fontWeight: 850, marginBottom: '4px' }}>{integration.name}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.45 }}>{integration.description}</p>
            </div>
          </div>
          <span style={{ whiteSpace: 'nowrap', borderRadius: '999px', padding: '5px 9px', fontSize: '11px', fontWeight: 800, color: isConnected ? accent : 'var(--text-muted)', background: isConnected ? `${accent}14` : 'var(--surface)', border: `1px solid ${isConnected ? `${accent}33` : 'var(--border)'}` }}>
            {isConnected ? `${integration.connectionCount} conectada${integration.connectionCount === 1 ? '' : 's'}` : isComingSoon ? 'Pronto' : 'Disponible'}
          </span>
        </div>

        {connections.length ? (
          <div style={{ display: 'grid', gap: '8px' }}>
            {connections.slice(0, 4).map((connection) => (
              <div key={`${connection.provider}-${connection.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '9px 10px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '12px' }}>
                <strong style={{ color: 'var(--text)' }}>{connection.displayName || connection.externalStoreId}</strong>
                <span style={{ color: 'var(--text-muted)' }}>{formatDateTime(connection.connectedAt)}</span>
              </div>
            ))}
            {connections.length > 4 ? <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>+{connections.length - 4} conexiones más</div> : null}
          </div>
        ) : null}

        <button
          type="button"
          className={isConnected ? 'btn btn-ghost' : 'btn btn-primary'}
          disabled={isComingSoon}
          onClick={() => onOpenProvider(integration.provider)}
          style={{ justifyContent: 'center' }}
        >
          {isComingSoon ? 'Próximamente' : isConnected ? 'Abrir módulo' : 'Configurar'}
        </button>
      </div>
    </article>
  );
}

export default function IntegrationsSection({ onNavigate }) {
  const [available, setAvailable] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/integrations');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar las integraciones');
      setAvailable(data.available || []);
      setConnections(data.connections || []);
    } catch (err) {
      setError(err.message || 'Error inesperado');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleOpenProvider = (provider) => {
    if (provider === 'shopify') {
      onNavigate?.('shopify');
      return;
    }
    if (provider === 'tiendanube' || provider === 'zipnova' || provider === 'mercadolibre') {
      onNavigate?.(provider);
      return;
    }
  };

  if (loading) {
    return <div className="section"><div className="spinner"></div></div>;
  }

  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">Centro de integraciones</h2>
        <p className="section-subtitle">Conectá canales de venta y operadores logísticos. Los módulos operativos aparecen cuando hay al menos una conexión activa.</p>
      </div>

      {error ? <div className="card" style={{ color: 'var(--danger)', marginBottom: '14px' }}>{error}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
        {available.map((integration) => (
          <IntegrationCard
            key={integration.provider}
            integration={integration}
            connections={connections.filter((connection) => connection.provider === integration.provider)}
            onOpenProvider={handleOpenProvider}
          />
        ))}
      </div>
    </section>
  );
}
