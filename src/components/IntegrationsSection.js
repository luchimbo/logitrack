"use client";

import InfoDisclosure from "./InfoDisclosure";
import SectionTitle from "./SectionTitle";

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
    <article className="card integration-card" style={{ padding: 0, overflow: 'hidden', border: `1px solid ${isConnected ? `${accent}55` : 'var(--border)'}` }}>
      <div style={{ padding: '18px', display: 'grid', gap: '16px' }}>
        <div className="integration-card-head">
          <div style={{ display: 'flex', gap: '12px', minWidth: 0 }}>
            <div style={{ width: '54px', height: '54px', flex: '0 0 54px', borderRadius: '16px', display: 'grid', placeItems: 'center', background: '#ffffff', color: accent, fontWeight: 900, border: `1px solid ${accent}35`, padding: '6px' }}>
              {providerLogo[integration.provider] ? (
                <Image
                  src={providerLogo[integration.provider]}
                  alt=""
                  width={42}
                  height={42}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : providerIcon[integration.provider] || integration.name[0]}
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 className="integration-provider-title">{integration.name}</h2>
              <p className="integration-provider-description">{integration.description}</p>
            </div>
          </div>
          <span className={`integration-status${isConnected ? ' is-connected' : ''}`}>
            {isConnected ? 'Conectado' : isComingSoon ? 'Próximamente' : 'Sin conectar'}
          </span>
        </div>

        {connections.length ? (
          <InfoDisclosure title="Cuentas conectadas" description={`Conexiones: ${connections.length}`}><div style={{ display: 'grid', gap: '8px' }}>
            {connections.slice(0, 4).map((connection) => (
              <div key={`${connection.provider}-${connection.id}`} className="integration-connection-row">
                <strong style={{ color: 'var(--text)' }}>{connection.displayName || connection.externalStoreId}</strong>
                <span style={{ color: 'var(--text-muted)' }}>{formatDateTime(connection.connectedAt)}</span>
              </div>
            ))}
            {connections.length > 4 ? <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>+{connections.length - 4} conexiones más</div> : null}
          </div></InfoDisclosure>
        ) : null}

        {!isComingSoon && <button
          type="button"
          className={isConnected ? 'btn btn-ghost' : 'btn btn-primary'}
          onClick={() => onOpenProvider(integration.provider)}
          aria-label={`${isConnected ? 'Abrir' : 'Configurar'} ${integration.name}`}
        >
          {isConnected ? 'Abrir módulo' : 'Configurar'}
        </button>}
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

  return (
    <section className="section">
      <div className="section-header">
        <SectionTitle icon="integrations">Centro de integraciones</SectionTitle>
        <p className="section-subtitle">Conectá canales de venta y operadores logísticos. Los módulos operativos aparecen cuando hay al menos una conexión activa.</p>
      </div>

      {loading && <p className="card" role="status">Cargando integraciones…</p>}
      {error && <div className="card integration-load-error">
        <p role="alert">{error}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load}>Reintentar</button>
      </div>}
      {!loading && !error && !available.length && <p className="card">No hay integraciones disponibles en este espacio de trabajo.</p>}

      <div className="integration-provider-grid">
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
