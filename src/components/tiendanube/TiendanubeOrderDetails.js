import { formatDateTime, getOperationalStatus } from "@/lib/tiendanubeOrderUtils";

export default function TiendanubeOrderDetails({ order }) {
  const operational = getOperationalStatus(order);
  const shippingAddress = [
    order.shippingAddress?.address,
    order.shippingAddress?.number,
    order.shippingAddress?.city,
    order.shippingAddress?.province,
  ].filter(Boolean).join(', ');

  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
        <strong style={{ color: 'var(--text)' }}>Estado Tiendanube:</strong> {operational.label}
        {order.shippingStatus ? ` · ${order.shippingStatus}` : ''}
      </div>
      {order.dispatchedAt ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>Despachado en Tiendanube:</strong> {formatDateTime(order.dispatchedAt)}
        </div>
      ) : null}
      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
        <strong style={{ color: 'var(--text)' }}>Envío:</strong> {shippingAddress || 'Sin dirección'}
        {order.shippingAddress?.zipcode ? ` · CP ${order.shippingAddress.zipcode}` : ''}
      </div>
      <div style={{ display: 'grid', gap: '6px' }}>
        {(order.products || []).slice(0, 6).map((product, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px' }}>
            <span style={{ color: 'var(--text)' }}>{product.name || 'Producto'}</span>
            <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>x{product.quantity || 1}</span>
          </div>
        ))}
        {(order.products || []).length > 6 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            +{(order.products || []).length - 6} productos más
          </div>
        ) : null}
        {(order.products || []).length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sin productos</div>
        ) : null}
      </div>
    </div>
  );
}
