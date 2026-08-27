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
