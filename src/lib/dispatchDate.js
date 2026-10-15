// Valores de fecha de despacho que a veces aparecen impresas en las etiquetas
// Flex ("27 AUG", "27 AUG 26", "AUG 27", etc.) y nunca deben persistirse
// como nombre de producto.
const MONTHS = 'JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC';
const DAY = '(?:0?[1-9]|[12]\\d|3[01])';

export const DISPATCH_DATE_RE = new RegExp(
  `^(?:${DAY}(?:\\s|-)(?:${MONTHS})(?:\\s+\\d{2,4})?|(?:${MONTHS})\\s+${DAY})$`,
  'i'
);

export const isDispatchDateValue = (value) =>
  DISPATCH_DATE_RE.test(String(value || '').trim());

// Franja horaria de entrega que ML imprime bajo la fecha en las etiquetas Flex
// ("hasta las 21 hs", "de 9 a 21 hs", "entre 14:00 y 18:00"...). Tampoco es producto.
export const DELIVERY_WINDOW_RE = /^(?:(?:hasta|desde|antes de)(?:\s+las?)?|de|entre)\s+\d{1,2}(?::\d{2})?\s*(?:(?:a|y|-)\s*(?:las?\s+)?\d{1,2}(?::\d{2})?\s*)?(?:hs?\.?|horas)?$/i;

export const isDeliveryWindowValue = (value) =>
  DELIVERY_WINDOW_RE.test(String(value || '').trim());

// Fecha o franja de entrega: textos de la etiqueta que nunca son el nombre del producto.
export const isLabelScheduleValue = (value) =>
  isDispatchDateValue(value) || isDeliveryWindowValue(value);

// Leyenda bajo la cantidad ("1 Unidad", "2 Unidades") en las etiquetas Flex.
export const isUnitsCaptionValue = (value) =>
  /^unidad(?:es)?$/i.test(String(value || '').trim());

// Textos fijos de la etiqueta que nunca son el nombre del producto.
export const isNonProductLabelValue = (value) =>
  isLabelScheduleValue(value) || isUnitsCaptionValue(value);
