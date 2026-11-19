// Pasos de «Primeros pasos» y del recorrido inicial. Funciones puras: se prueban sin pantalla.

// Cada paso con `done` definido cuenta para el avance; el resto son accesos informativos.
export function buildChecklistSteps(status, canManage) {
  const hasChannel = Boolean(status.connected);
  const hasShipments = Boolean(status.shipments);
  return [
    {
      id: 'channel',
      title: 'Conectá un canal o cargá etiquetas',
      detail: hasChannel ? 'Canal conectado' : hasShipments ? 'Ya hay envíos cargados' : canManage ? 'Conectá tu tienda o subí un archivo de etiquetas' : 'Subí un archivo de etiquetas; un administrador puede conectar los canales',
      done: hasChannel || hasShipments,
      tab: canManage ? 'integrations' : 'upload',
      action: canManage ? 'Ir a Canales' : 'Subir etiquetas',
    },
    {
      id: 'shipments',
      title: 'Obtené tus primeros envíos',
      detail: hasShipments ? 'Hay envíos en tu espacio' : 'Importá pedidos o subí etiquetas para verlos acá',
      done: hasShipments,
      tab: 'upload',
      action: 'Subir etiquetas',
    },
    {
      id: 'zones',
      title: 'Configurá zonas para Flex',
      detail: status.zones ? 'Hay zonas configuradas' : 'Opcional si no usás Flex',
      done: Boolean(status.zones),
      tab: 'zoneConfig',
      action: 'Configurar zonas',
    },
    {
      id: 'picking',
      title: 'Revisá el picking',
      detail: hasShipments ? 'Disponible con los envíos cargados' : 'Disponible cuando cargues envíos',
      tab: 'pickingList',
      action: 'Abrir picking',
    },
    {
      id: 'labels',
      title: 'Consultá tus etiquetas',
      detail: status.labels ? 'Hay etiquetas disponibles' : 'Aparecerán cuando cargues etiquetas compatibles',
      done: Boolean(status.labels),
      tab: 'upload',
      action: 'Ver etiquetas',
    },
  ];
}

export function checklistProgress(steps) {
  const tracked = steps.filter((step) => step.done !== undefined);
  return { done: tracked.filter((step) => step.done).length, total: tracked.length };
}

const TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Bienvenido a GeoModi',
    body: 'Este espacio te permite seguir toda la operación logística sin mezclar datos con otros usuarios.',
    recommended: 'Conocer los primeros pasos',
  },
  {
    id: 'channel',
    title: 'Conectá tu canal',
    body: 'Desde “Canales e integraciones” conectás Mercado Libre, Tiendanube u otros canales para que tus pedidos lleguen solos.',
    tab: 'integrations',
    recommended: 'Conectar tu primer canal',
    adminOnly: true,
  },
  {
    id: 'upload',
    title: 'Subí etiquetas',
    body: 'Si todavía no conectaste un canal, empezá desde “Subir Etiquetas”: cargás los archivos ZPL/TXT y el sistema los transforma en envíos operativos.',
    tab: 'upload',
    recommended: 'Subir primeras etiquetas',
  },
  {
    id: 'dashboard',
    title: 'Revisá el Dashboard',
    body: 'En Dashboard vas a ver envíos, unidades y comparativas por período. Podés usar fecha o rango y aplicar los filtros manualmente.',
    tab: 'dashboard',
    recommended: 'Mirar métricas y comparativas',
  },
  {
    id: 'picking',
    title: 'Prepará Picking y operación',
    body: 'Picking te resume productos y cantidades. Flex y Colecta separan la operación diaria para despacho. Al finalizar te llevamos a “Operación de hoy”, donde sigue la lista de Primeros pasos.',
    tab: 'pickingList',
    recommended: 'Preparar el picking',
  },
];

// El paso de canales solo se muestra a quien puede conectarlos.
export function tourStepsFor(canManage) {
  return TOUR_STEPS.filter((step) => canManage || !step.adminOnly);
}
