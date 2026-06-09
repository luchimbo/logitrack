"use client";

import { formatArgentinaDateTime } from "@/lib/dateUtils";

function chipStyle(color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    borderRadius: '999px',
    padding: '4px 8px',
    color,
    background: `${color}14`,
    border: `1px solid ${color}33`,
    fontSize: '11px',
    fontWeight: 750,
    lineHeight: 1.2,
  };
}

function formatCutoff(cutoff) {
  if (!cutoff?.value) return '';
  if (cutoff.precision === 'hour') return cutoff.label || `Corte ${cutoff.value}:00`;
  if (cutoff.precision === 'text') return `${cutoff.label}: ${cutoff.value}`;
  const parsed = new Date(cutoff.value);
  if (!Number.isNaN(parsed.getTime())) {
    return `${cutoff.label}: ${formatArgentinaDateTime(cutoff.value)}`;
  }
  return `${cutoff.label}: ${cutoff.value}`;
}

export default function MercadoLibreShipmentMeta({ shipment, compact = false }) {
  const state = shipment?.ml_package_state || shipment?.packageState;
  const printability = shipment?.ml_printability || shipment?.printability;
  const cutoff = shipment?.ml_cutoff || shipment?.cutoffDetail;
  const cutoffLabel = formatCutoff(cutoff);

  if (!state && !printability && !cutoffLabel) return null;

  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: compact ? '4px' : '8px' }}>
      {state ? <span style={chipStyle(state.color || '#64748b')}>{state.label || state.id}</span> : null}
      {printability ? <span style={chipStyle(printability.color || '#64748b')}>{printability.label || printability.id}</span> : null}
      {cutoffLabel ? (
        <span style={chipStyle(cutoff?.exact ? '#f97316' : '#60a5fa')}>
          {cutoffLabel}
        </span>
      ) : null}
    </div>
  );
}
