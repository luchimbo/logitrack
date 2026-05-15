import {
  badgeStyle,
  formatOrderDate,
  formatOrderTotal,
  getOperationalStatus,
  getProductSummary,
  getRowActionConfig,
  getShippingProviderLabel,
} from "@/lib/tiendanubeOrderUtils";
import TiendanubeOrderDetails from "@/components/tiendanube/TiendanubeOrderDetails";

export default function TiendanubeOrderCard({ order, isExpanded, onToggle, selected, onSelectionToggle, onAction, updating }) {
  const operational = getOperationalStatus(order);
  const productSummary = getProductSummary(order);
  const actionConfig = getRowActionConfig(order);

  return (
    <div className="mobile-card" style={{ display: 'block', marginBottom: 0, padding: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, display: 'flex', gap: '12px', alignItems: 'flex-start', flex: 1 }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelectionToggle}
            aria-label={`Seleccionar pedido ${order.number || order.id}`}
            style={{ marginTop: '4px' }}
          />

          <div style={{ minWidth: 0 }}>
            <div className="mobile-card-title" style={{ fontSize: '20px', marginBottom: '4px' }}>
              Pedido #{order.number || order.id}
            </div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>{order.contactName || 'Sin nombre'}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{getShippingProviderLabel(order)}</div>
          </div>
        </div>

        <button type="button" className="btn btn-ghost btn-sm" onClick={onToggle}>
          {isExpanded ? 'Ocultar' : 'Ver detalle'}
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
        <span style={badgeStyle(operational.color)}>{operational.label}</span>
        <button type="button" className="btn btn-sm" onClick={onAction} disabled={updating} style={actionConfig.style}>
          {updating ? 'Guardando...' : actionConfig.label}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', marginTop: '14px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>Total:</strong> {formatOrderTotal(order.total, order.currency)}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>Fecha:</strong> {formatOrderDate(order.createdAt)}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
          <strong style={{ color: 'var(--text)' }}>Productos:</strong> {productSummary.label} · {productSummary.detail}
        </div>
      </div>

      {isExpanded && (
        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
          <TiendanubeOrderDetails order={order} />
        </div>
      )}
    </div>
  );
}
