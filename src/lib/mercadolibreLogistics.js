const IN_TRANSIT_STATUSES = new Set(['shipped', 'in_transit']);
const DELIVERED_STATUSES = new Set(['delivered']);
const CANCELED_STATUSES = new Set(['cancelled', 'canceled']);
const PROBLEM_STATUSES = new Set(['not_delivered', 'lost']);
const SCANNED_SUBSTATUSES = new Set([
  'picked_up',
  'in_hub',
  'in_transit',
  'out_for_delivery',
  'deliver_attempt',
  'waiting_for_pickup',
  'ready_to_pickup',
  'me2_in_transit',
  'me2_picked_up',
  'authorized_by_carrier',
]);
const PRINTABLE_SUBSTATUSES = new Set(['ready_to_print', 'printed']);
const PREPARING_SUBSTATUSES = new Set(['waiting_for_label_generation', 'regenerating', 'invoice_pending']);

const STATE_META = {
  preparing: { id: 'preparing', label: 'En preparacion', color: '#60a5fa' },
  ready_to_print: { id: 'ready_to_print', label: 'Lista para imprimir', color: '#f97316' },
  ready_to_ship: { id: 'ready_to_ship', label: 'Lista para despachar', color: '#f97316' },
  in_transit: { id: 'in_transit', label: 'En transito', color: '#22c55e' },
  delivered: { id: 'delivered', label: 'Entregado', color: '#22c55e' },
  delayed: { id: 'delayed', label: 'Demorado', color: '#ef4444' },
  canceled: { id: 'canceled', label: 'Cancelado', color: '#64748b' },
  problem: { id: 'problem', label: 'Con incidencia', color: '#ef4444' },
  pending: { id: 'pending', label: 'Pendiente', color: '#64748b' },
};

const PRINTABILITY_META = {
  imported: { id: 'imported', label: 'Etiqueta descargada', color: '#22c55e', canImport: false, canPrint: true },
  printable: { id: 'printable', label: 'Lista para imprimir', color: '#f97316', canImport: true, canPrint: false },
  not_ready: { id: 'not_ready', label: 'ML aún no generó etiqueta', color: '#64748b', canImport: false, canPrint: false },
  unavailable: { id: 'unavailable', label: 'Sin envío asignado', color: '#64748b', canImport: false, canPrint: false },
  error: { id: 'error', label: 'Revisar envío', color: '#ef4444', canImport: false, canPrint: false },
};

const STATUS_LABELS = {
  pending: 'Pendiente',
  handling: 'En preparacion',
  ready_to_ship: 'Listo para despachar',
  shipped: 'En transito',
  in_transit: 'En transito',
  delivered: 'Entregado',
  not_delivered: 'No entregado',
  cancelled: 'Cancelado',
  canceled: 'Cancelado',
};

const SUBSTATUS_LABELS = {
  ready_to_print: 'Etiqueta disponible',
  printed: 'Etiqueta impresa',
  waiting_for_label_generation: 'Generando etiqueta',
  picked_up: 'Retirado por transportista',
  authorized_by_carrier: 'Autorizado por transportista',
  in_hub: 'En centro de distribucion',
  in_transit: 'En viaje',
  out_for_delivery: 'En reparto',
  deliver_attempt: 'Intento de entrega',
  receiver_absent: 'Comprador ausente',
  bad_address: 'Direccion incorrecta',
  buyer_rescheduled: 'Reprogramado por comprador',
  ready_to_pickup: 'Listo para retirar',
  waiting_for_pickup: 'Esperando retiro',
};

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

function hasDelay(delays, substatus = '') {
  if (lower(substatus).includes('delayed')) return true;
  if (!delays) return false;
  if (Array.isArray(delays)) return delays.length > 0;
  if (Array.isArray(delays.delays)) return delays.delays.length > 0;
  return Object.keys(delays || {}).length > 0;
}

function asState(id) {
  return STATE_META[id] || STATE_META.pending;
}

function asPrintability(id, reason = '') {
  const meta = PRINTABILITY_META[id] || PRINTABILITY_META.unavailable;
  return { ...meta, reason };
}

function eventLabel(status, substatus) {
  const statusKey = lower(status);
  const substatusKey = lower(substatus);
  if (substatusKey && SUBSTATUS_LABELS[substatusKey]) return SUBSTATUS_LABELS[substatusKey];
  if (statusKey && STATUS_LABELS[statusKey]) return STATUS_LABELS[statusKey];
  return substatus || status || 'Actualizacion';
}

function firstString(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function getNestedWindowValue(source) {
  if (!source || typeof source !== 'object') return '';
  const candidates = [
    source.date,
    source.from,
    source.start,
    source.start_date,
    source.begin,
    source.pickup_date,
    source.estimated_pickup,
  ];
  return firstString(...candidates);
}

function deriveFlexConfigCutoff(flexConfig) {
  if (!flexConfig || typeof flexConfig !== 'object') return null;
  const config = flexConfig.configuration || flexConfig;
  const dayNames = ['week', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  for (const day of dayNames) {
    const ranges = config.delivery_ranges?.[day];
    const list = Array.isArray(ranges) ? ranges : [];
    const range = list.find((item) => item?.calculated_cutoff || item?.cutoff || item?.et_hour);
    if (range) {
      const value = range.calculated_cutoff || range.cutoff || range.et_hour;
      return {
        value: String(value),
        label: `Corte Flex ${value}:00`,
        source: 'Flex config',
        precision: 'hour',
        exact: true,
      };
    }
  }

  const zones = Array.isArray(config.zones) ? config.zones : [];
  const zone = zones.find((item) => item?.cutoff?.week || item?.cutoff?.saturday || item?.cutoff?.sunday);
  if (zone) {
    const value = zone.cutoff.week || zone.cutoff.saturday || zone.cutoff.sunday;
    return {
      value: String(value),
      label: `Corte Flex ${value}:00`,
      source: 'Flex config',
      precision: 'hour',
      exact: true,
    };
  }

  return null;
}

export function deriveCutoffDetail({ logisticType = '', shippingMethod = '', leadTime = {}, carrier = null, labelDispatchDate = '' } = {}) {
  const type = lower(logisticType);
  const method = lower(shippingMethod);
  const isFlex = type === 'self_service' || method === 'flex';
  const assignment = carrier?.flex_assignment || {};
  const assignmentWindow = assignment.pickup_window || assignment.time_window || assignment.delivery_window || assignment.window || assignment.route?.time_window;
  const assignmentValue = getNestedWindowValue(assignmentWindow) || getNestedWindowValue(assignment);

  if (isFlex && assignmentValue) {
    return {
      value: assignmentValue,
      label: 'Corte Flex',
      source: 'Asignacion Flex',
      precision: 'datetime',
      exact: true,
    };
  }

  if (isFlex) {
    const flexConfigCutoff = deriveFlexConfigCutoff(carrier?.flex_config);
    if (flexConfigCutoff) return flexConfigCutoff;
  }

  if (!isFlex && labelDispatchDate) {
    return {
      value: labelDispatchDate,
      label: 'Despachar',
      source: 'Etiqueta importada',
      precision: /\d{1,2}:\d{2}/.test(labelDispatchDate) ? 'datetime' : 'text',
      exact: /\d{1,2}:\d{2}/.test(labelDispatchDate),
    };
  }

  const handlingLimit = firstString(leadTime?.estimated_handling_limit?.date);
  if (handlingLimit) {
    return {
      value: handlingLimit,
      label: isFlex ? 'Limite Flex' : 'Limite de despacho',
      source: 'ML lead time',
      precision: 'date',
      exact: false,
    };
  }

  return {
    value: '',
    label: 'No disponible',
    source: 'No disponible',
    precision: 'none',
    exact: false,
  };
}

export function derivePackageState({ shipmentStatus = '', shipmentSubstatus = '', delays = null } = {}) {
  const status = lower(shipmentStatus);
  const substatus = lower(shipmentSubstatus);

  if (CANCELED_STATUSES.has(status)) return asState('canceled');
  if (PROBLEM_STATUSES.has(status)) return asState('problem');
  if (DELIVERED_STATUSES.has(status)) return asState('delivered');
  if (hasDelay(delays, substatus)) return asState('delayed');
  if (IN_TRANSIT_STATUSES.has(status) || SCANNED_SUBSTATUSES.has(substatus)) return asState('in_transit');
  if (status === 'ready_to_ship' && PRINTABLE_SUBSTATUSES.has(substatus)) return asState('ready_to_print');
  if (status === 'ready_to_ship') return asState('ready_to_ship');
  if (status === 'handling' || PREPARING_SUBSTATUSES.has(substatus)) return asState('preparing');
  return asState('pending');
}

export function derivePrintability({ shipmentId = '', shipmentStatus = '', shipmentSubstatus = '', labelImportedAt = '', shipmentRowId = null } = {}) {
  const status = lower(shipmentStatus);
  const substatus = lower(shipmentSubstatus);

  if (labelImportedAt || shipmentRowId) return asPrintability('imported');
  if (!shipmentId) return asPrintability('unavailable', 'La venta no tiene shipment_id');
  if (CANCELED_STATUSES.has(status) || PROBLEM_STATUSES.has(status)) return asPrintability('error', 'El envio no esta disponible para imprimir');
  if (status === 'ready_to_ship' && PRINTABLE_SUBSTATUSES.has(substatus)) return asPrintability('printable');
  if (status === 'ready_to_ship' && !substatus) return asPrintability('printable');
  return asPrintability('not_ready', eventLabel(status, substatus));
}

export function deriveTimeline(history = [], { shipmentStatus = '', shipmentSubstatus = '' } = {}) {
  const events = Array.isArray(history) ? history : [];
  const normalized = events
    .map((event) => ({
      status: event?.status || '',
      substatus: event?.substatus || '',
      date: event?.date || event?.created_at || '',
      label: eventLabel(event?.status, event?.substatus),
    }))
    .filter((event) => event.status || event.substatus || event.date)
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, 6);

  if (normalized.length) return normalized;
  if (shipmentStatus || shipmentSubstatus) {
    return [{
      status: shipmentStatus || '',
      substatus: shipmentSubstatus || '',
      date: '',
      label: eventLabel(shipmentStatus, shipmentSubstatus),
    }];
  }
  return [];
}

export function deriveMercadoLibreLogistics(input = {}) {
  const packageState = derivePackageState(input);
  const printability = derivePrintability(input);
  const cutoff = deriveCutoffDetail(input);
  const timeline = deriveTimeline(input.history, input);
  const dispatchState = packageState.id === 'in_transit' || packageState.id === 'delivered'
    ? 'scanned'
    : packageState.id === 'ready_to_print' || packageState.id === 'ready_to_ship'
      ? 'ready'
      : 'pending';

  return {
    packageState,
    printability,
    cutoff,
    timeline,
    dispatchState,
  };
}
