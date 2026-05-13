import { NextResponse } from 'next/server';
import { requireWorkspaceActor } from '@/lib/auth';
import { listIntegrationConnections, listIntegrationsMeta } from '@/lib/integrationService';

const AVAILABLE_INTEGRATIONS = [
  {
    provider: 'shopify',
    name: 'Shopify',
    description: 'Conecta una o varias tiendas Shopify para centralizar pedidos y despachos.',
    status: 'available',
    supportsMultiple: true,
  },
  {
    provider: 'tiendanube',
    name: 'Tiendanube',
    description: 'Pedidos por enviar o despachados, productos y datos de envio.',
    status: 'available',
    supportsMultiple: true,
  },
  {
    provider: 'mercadolibre',
    name: 'Mercado Libre',
    description: 'Ventas pagadas, envios Flex/Colecta, estados, SLA y etiquetas ZPL.',
    status: 'available',
    supportsMultiple: true,
  },
  {
    provider: 'zipnova',
    name: 'Zipnova',
    description: 'Envios, recolecciones, etiquetas disponibles y estados de preparacion.',
    status: 'available',
    supportsMultiple: false,
  },
  {
    provider: 'correo_argentino',
    name: 'Correo Argentino',
    description: 'Creacion de envios, tracking y etiquetas.',
    status: 'coming_soon',
    supportsMultiple: false,
  },
];

function legacyExternalStoreId(provider, config = {}) {
  if (provider === 'tiendanube') return String(config.storeId || 'tiendanube');
  if (provider === 'zipnova') return 'zipnova';
  return provider;
}

export async function GET(request) {
  try {
    const authResult = await requireWorkspaceActor(request);
    if (authResult.error) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const workspaceId = authResult.actor.workspaceId;
    const connections = await listIntegrationConnections({ workspaceId });
    const legacy = await listIntegrationsMeta(workspaceId);
    const connectionKeys = new Set(connections.map((item) => `${item.provider}:${item.externalStoreId}`));
    const providersWithConnections = new Set(connections.map((item) => item.provider));
    const legacyConnections = legacy
      .filter((item) => item.isActive && !providersWithConnections.has(item.provider))
      .map((item) => {
        const externalStoreId = legacyExternalStoreId(item.provider);
        return {
          id: `legacy-${item.provider}`,
          provider: item.provider,
          externalStoreId,
          displayName: item.provider === 'tiendanube' ? 'Tienda conectada' : item.provider,
          connectedAt: item.connectedAt,
          isActive: item.isActive,
          legacy: true,
        };
      })
      .filter((item) => !connectionKeys.has(`${item.provider}:${item.externalStoreId}`));

    const allConnections = [...connections, ...legacyConnections];
    const connectedProviders = [...new Set(allConnections.filter((item) => item.isActive).map((item) => item.provider))];

    return NextResponse.json({
      available: AVAILABLE_INTEGRATIONS.map((integration) => ({
        ...integration,
        connected: connectedProviders.includes(integration.provider),
        connectionCount: allConnections.filter((item) => item.provider === integration.provider && item.isActive).length,
      })),
      connections: allConnections,
      connectedProviders,
    });
  } catch (error) {
    console.error('Integrations summary error:', error);
    return NextResponse.json({ error: error.message || 'Error al consultar integraciones' }, { status: 500 });
  }
}
