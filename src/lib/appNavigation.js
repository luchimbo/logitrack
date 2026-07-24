export function buildAppNavigation({ currentUser, canManageUsers, connectedProviders }) {
  const hasOperationsPreview = currentUser?.workspaceSlug === "legacy";
  const operacionItems = [
    ...(hasOperationsPreview ? [{ id: "operationToday", icon: "operation", label: "Operación de hoy" }] : []),
    { id: "pickingList", icon: "picking", label: "Lista de Picking" },
    { id: "flex", icon: "flex", label: "Logística Flex" },
    { id: "colecta", icon: "colecta", label: "Colecta" },
    ...(hasOperationsPreview ? [{ id: "printJobs", icon: "print", label: "Historial de impresión" }] : []),
    { id: "dashboard", icon: "dashboard", label: "Dashboard" },
    { id: "upload", icon: "upload", label: "Subir Etiquetas" },
    { id: "map", icon: "map", label: "Mapa" },
  ];

  if (hasOperationsPreview) {
    operacionItems.push({ id: "sheetSync", icon: "dashboard", label: "Envíos Planilla", badgeKey: "sheetSync" });
  }

  const navGroups = [
    { title: "Operación", items: operacionItems },
    { title: "Configuración", items: [{ id: "zoneConfig", icon: "zones", label: "Config. Zonas" }] },
    { title: "Integraciones", items: [{ id: "integrations", icon: "integrations", label: "Conectar" }] },
  ];

  const activeIntegrationItems = [
    connectedProviders.includes("shopify") ? { id: "shopify", icon: "integrations", label: "Shopify" } : null,
    connectedProviders.includes("zipnova") ? { id: "zipnova", icon: "colecta", label: "Zipnova" } : null,
    connectedProviders.includes("tiendanube") ? { id: "tiendanube", icon: "colecta", label: "Tiendanube" } : null,
    connectedProviders.includes("mercadolibre") ? { id: "mercadolibre", icon: "integrations", label: "Mercado Libre", badgeKey: "mercadolibre" } : null,
  ].filter(Boolean);
  if (activeIntegrationItems.length) navGroups.push({ title: "Conectadas", items: activeIntegrationItems });

  if (currentUser?.isGlobalAdmin || canManageUsers) {
    const adminItems = [];
    if (currentUser?.isGlobalAdmin) adminItems.push({ id: "adminOverview", icon: "settings", label: "Admin Maestro" });
    if (canManageUsers) adminItems.push({ id: "userManagement", icon: "users", label: "Usuarios" });
    navGroups.push({ title: "Administración", items: adminItems });
  }
  return navGroups;
}
