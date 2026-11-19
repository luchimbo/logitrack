// Textos de las pantallas sin datos y de las cargas fallidas. Un vacío le dice al comercio
// qué hacer; un error de carga nunca se presenta como si no hubiera datos.
export const EMPTY_STATES = {
  flex: {
    title: 'Todavía no hay paquetes Flex',
    text: 'Cuando conectes un canal o subas etiquetas, los envíos Flex aparecen acá para repartirlos entre tus transportistas.',
    actions: [{ label: 'Ir a Canales', tab: 'integrations' }, { label: 'Subir etiquetas', tab: 'upload' }],
  },
  flexNoCarriers: {
    title: 'Todavía no cargaste transportistas',
    text: 'Para repartir paquetes, primero configurá tus zonas y transportistas.',
    actions: [{ label: 'Configurar zonas', tab: 'zoneConfig' }],
  },
  colecta: {
    title: 'No hay envíos de colecta de hoy',
    text: 'Se muestran los envíos de colecta del día. Si todavía no cargaste nada, conectá un canal o subí etiquetas.',
    actions: [{ label: 'Ir a Canales', tab: 'integrations' }, { label: 'Subir etiquetas', tab: 'upload' }],
  },
};

export function loadFailure(section, message) {
  return {
    title: `No pudimos cargar ${section}`,
    text: message || 'Reintentá en unos minutos.',
  };
}

// Flex sin paquetes ni transportistas: qué guía mostrar (o ninguna).
export function flexGuide({ shipments, carriers }) {
  if (shipments.length) return null;
  return carriers.length ? EMPTY_STATES.flex : { ...EMPTY_STATES.flex, extra: EMPTY_STATES.flexNoCarriers };
}
