export function buildAppNavigation({ currentUser, canManageUsers, connectedProviders }) {
  const navGroups = [
    {
      title: "Operación",
      items: [
        { id: "upload", icon: "📦", label: "Subir Etiquetas" },
        { id: "pickingList", icon: "📋", label: "Lista de Picking" },
        { id: "flex", icon: "🚀", label: "Logística Flex" },
        { id: "colecta", icon: "📦", label: "Colecta" },
        { id: "map", icon: "📍", label: "Mapa" },
        { id: "dashboard", icon: "📊", label: "Dashboard" },
      ],
    },
    {
      title: "Configuración",
      items: [
        { id: "zoneConfig", icon: "⚙️", label: "Config. Zonas" },
      ],
    },
    {
      title: "Integraciones",
      items: [
        { id: "integrations", icon: "🔌", label: "Conectar" },
      ],
    },
  ];

  const activeIntegrationItems = [
    connectedProviders.includes('shopify') ? { id: "shopify", icon: "🟢", label: "Shopify" } : null,
    connectedProviders.includes('zipnova') ? { id: "zipnova", icon: "📮", label: "Zipnova" } : null,
    connectedProviders.includes('tiendanube') ? { id: "tiendanube", icon: "🛒", label: "Tiendanube" } : null,
    connectedProviders.includes('mercadolibre') ? { id: "mercadolibre", icon: "🟡", label: "Mercado Libre", badgeKey: "mercadolibre" } : null,
  ].filter(Boolean);

  if (activeIntegrationItems.length) {
    navGroups.push({ title: "Conectadas", items: activeIntegrationItems });
  }

  if (currentUser?.isGlobalAdmin || canManageUsers) {
    const adminItems = [];
    if (currentUser?.isGlobalAdmin) {
      adminItems.push({ id: "adminOverview", icon: "🛡️", label: "Admin Maestro" });
    }
    if (canManageUsers) {
      adminItems.push({ id: "userManagement", icon: "👤", label: "Usuarios" });
    }
    navGroups.push({ title: "Administración", items: adminItems });
  }

  return navGroups;
}
