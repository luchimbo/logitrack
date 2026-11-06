import { randomUUID } from 'node:crypto';

export const ONLINE_TRACKING_START = '2026-10-19T03:00:00.000Z';
export const RECONCILIATION_INTERVAL_MS = 5 * 60_000;

// Se buscan pedidos MODIFICADOS, sin filtrar estado ni fecha de creación.
// Así entran transferencias antiguas recién recibidas, y salen pagos anulados.
export function createOrderReconciler({ repository, clientFor, record, now = () => new Date(), perPage = 100, maxPages = 100 }) {
  return async function reconcile(storeId) {
    const state = await repository.syncState(storeId);
    const at = now().toISOString();
    if (state?.last_success_at && Date.parse(at) - Date.parse(state.last_success_at) < RECONCILIATION_INTERVAL_MS) {
      return { status: 'current', lastSuccessAt: state.last_success_at };
    }
    const leaseId = randomUUID();
    if (!await repository.acquire(storeId, leaseId, at, new Date(Date.parse(at) + 5 * 60_000).toISOString())) {
      throw Object.assign(new Error('La conciliación de ventas está en curso. Volvé a consultar en unos segundos.'), { status: 409 });
    }
    let processed = 0;
    try {
      const client = await clientFor(storeId);
      const since = state?.last_success_at
        ? new Date(Math.max(Date.parse(ONLINE_TRACKING_START), Date.parse(state.last_success_at) - 10 * 60_000)).toISOString()
        : ONLINE_TRACKING_START;
      for (let page = 1; page <= maxPages; page++) {
        const orders = await client.listOrders({ page, perPage, status: 'any', paymentStatus: 'any',
          updatedAtMin: since, updatedAtMax: at,
          fields: 'id,number,created_at,updated_at,total,status,payment_status,products,promotional_discount' });
        if (!Array.isArray(orders)) throw new Error('Respuesta de pedidos inválida');
        for (const order of orders) {
          await record(storeId, order);
          processed++;
        }
        if (orders.length < perPage) {
          const result = { status: 'reconciled', lastSuccessAt: at, processed, updatedSince: since };
          await repository.finish(storeId, leaseId, at, result);
          return result;
        }
      }
      throw new Error('La conciliación excedió el límite de páginas; no se adelantó la última revisión');
    } catch (error) {
      await repository.finish(storeId, leaseId, at, { processed }, 'No se pudo completar la conciliación de pedidos');
      throw error;
    }
  };
}
