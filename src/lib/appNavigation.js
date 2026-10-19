export function buildAppNavigation({ currentUser, canManageUsers, connectedProviders }) {
  const hasOperationsPreview = currentUser?.workspaceSlug === "legacy";
  const operacionItems = [
    ...(hasOperationsPreview ? [{ id: "operationToday", icon: "operation", label: "Operación de hoy" }] : []),
    { id: "pickingList", icon: "picking", label: "Lista de Picking" },
    { id: "flex", icon: "flex", label: "Logística Flex" },
    { id: "colecta", icon: "colecta", label: "Colecta" },
    ...(hasOperationsPreview ? [{ id: "printJobs", icon: "colecta", label: "Historial de paquetes" }] : []),
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

export function getDefaultAppTab({ currentUser, navGroups = [] }) {
  const preferred = currentUser?.workspaceSlug === "legacy" ? "operationToday" : "upload";
  const availableIds = new Set(navGroups.flatMap((group) => group.items.map((item) => item.id)));

  if (availableIds.has(preferred)) return preferred;
  return navGroups[0]?.items?.[0]?.id || "upload";
}

export function resolveAppTab({ requestedTab, currentUser, navGroups = [] }) {
  // Permitir la configuración inicial y el regreso de OAuth sin conexión previa.
  if (currentUser && ["tiendanube", "shopify", "mercadolibre", "zipnova"].includes(requestedTab)) return requestedTab;
  const availableIds = new Set(navGroups.flatMap((group) => group.items.map((item) => item.id)));
  return availableIds.has(requestedTab)
    ? requestedTab
    : getDefaultAppTab({ currentUser, navGroups });
}

export function buildMobileNavigation({ currentUser, navGroups = [] }) {
  const preferredIds = currentUser?.workspaceSlug === "legacy"
    ? ["operationToday", "pickingList", "flex", "colecta"]
    : ["upload", "pickingList", "flex", "colecta"];
  const shortLabels = {
    operationToday: "Hoy",
    upload: "Cargar",
    pickingList: "Picking",
    flex: "Flex",
    colecta: "Colecta",
  };
  const itemById = new Map(
    navGroups.flatMap((group) => group.items).map((item) => [item.id, item]),
  );

  const primaryItems = preferredIds
    .map((id) => itemById.get(id))
    .filter(Boolean)
    .map((item) => ({ ...item, label: shortLabels[item.id] || item.label }));
  const primaryIds = new Set(primaryItems.map((item) => item.id));
  const moreGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !primaryIds.has(item.id)),
    }))
    .filter((group) => group.items.length > 0);

  return { primaryItems, moreGroups };
}

export function isMobileMoreActive({ activeTab, primaryItems = [] }) {
  return Boolean(activeTab) && !primaryItems.some((item) => item.id === activeTab);
}
