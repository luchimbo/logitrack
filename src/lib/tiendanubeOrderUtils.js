import { formatArgentinaDate, formatArgentinaDateTime, getArgentinaDateString } from "@/lib/dateUtils";

export function formatOrderTotal(total, currency) {
  const numeric = Number(total);
  if (Number.isNaN(numeric)) return total ? `${currency || ''} ${total}`.trim() : '-';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency || 'ARS',
    minimumFractionDigits: 2,
  }).format(numeric);
}

export function badgeStyle(color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
    border: `1px solid ${color}33`,
    color,
    background: `${color}12`,
    lineHeight: 1,
  };
}

export function formatOrderDate(value) {
  if (!value) return '-';
  return formatArgentinaDate(value, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTime(value) {
  if (!value) return '-';
  return formatArgentinaDateTime(value, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function isSameArgentinaDay(value) {
  if (!value) return false;
  const today = getArgentinaDateString();
  const target = getArgentinaDateString(value);
  return today === target;
}

export function getOperationalStatus(order) {
  const shippingStatus = String(order?.shippingStatus || '').toLowerCase();

  if (shippingStatus === 'shipped' || shippingStatus === 'delivered') {
    return { key: 'dispatched', label: 'Despachado', color: '#22c55e' };
  }

  return { key: 'to_send', label: 'Por enviar', color: '#f97316' };
}

export function getRowActionConfig(order) {
  const operational = getOperationalStatus(order);

  if (operational.key === 'to_send') {
    return {
      status: 'dispatched',
      label: 'Despachado',
      style: {
        background: 'var(--success-bg, rgba(34,197,94,0.12))',
        color: 'var(--success, #16a34a)',
        border: '1px solid var(--success, #16a34a)',
      },
    };
  }

  return {
    status: 'to_send',
    label: 'Por enviar',
    style: {
      background: 'rgba(249,115,22,0.12)',
      color: '#f97316',
      border: '1px solid #f97316',
    },
  };
}

export function getShippingProviderLabel(order) {
  const carrier = String(order?.shippingCarrier || '').trim();
  const method = String(order?.shippingMethod || '').trim();
  if (carrier && method) {
    return carrier.toLowerCase() === method.toLowerCase() ? carrier : `${carrier} · ${method}`;
  }
  return carrier || method || 'Envío a domicilio';
}

export function getProductSummary(order) {
  const products = Array.isArray(order?.products) ? order.products : [];
  const totalUnits = products.reduce((sum, product) => sum + (Number(product?.quantity || 0) || 1), 0);
  const distinctNames = [...new Set(
    products
      .map((product) => String(product?.name || '').trim() || 'Producto')
      .filter(Boolean)
  )];

  if (!products.length) {
    return { label: 'Sin productos', detail: '-' };
  }

  if (distinctNames.length === 1) {
    return {
      label: `${totalUnits} unid.`,
      detail: distinctNames[0],
    };
  }

  const visibleNames = distinctNames.slice(0, 2).join(' · ');

  return {
    label: `${totalUnits} unid.`,
    detail: distinctNames.length > 2 ? `${visibleNames} +${distinctNames.length - 2} más` : visibleNames,
  };
}
