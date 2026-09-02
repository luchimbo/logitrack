const SEARCH_FIELDS = [
  "s.product_name",
  "s.sku",
  "s.tracking_number",
  "s.sale_id",
  "s.external_order_id",
  "s.external_shipment_id",
];

const EXACT_IDENTIFIER_FIELDS = [
  "s.tracking_number",
  "s.sale_id",
  "s.external_order_id",
  "s.external_shipment_id",
];

export const PACKAGE_HISTORY_PAGE_SIZE = 50;
export const PACKAGE_HISTORY_MAX_PAGE_SIZE = 100;

export function normalizePackageHistoryQuery(value) {
  return String(value || "").trim().slice(0, 160);
}

export function getPackageHistoryLimit(value) {
  const requested = Number(value);
  if (!Number.isFinite(requested)) return PACKAGE_HISTORY_PAGE_SIZE;
  return Math.max(1, Math.min(PACKAGE_HISTORY_MAX_PAGE_SIZE, Math.trunc(requested)));
}

export function encodePackageHistoryCursor({ rank, id }) {
  return `${Number(rank) || 0}:${Number(id) || 0}`;
}

export function decodePackageHistoryCursor(value) {
  const match = String(value || "").match(/^(\d+):(\d+)$/);
  if (!match || Number(match[2]) <= 0) return null;
  return { rank: Number(match[1]), id: Number(match[2]) };
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function buildPackageHistoryFilters({ workspaceId, query }) {
  const normalizedQuery = normalizePackageHistoryQuery(query);
  const clauses = ["s.workspace_id = ?"];
  const args = [workspaceId];

  if (normalizedQuery) {
    const pattern = `%${escapeLike(normalizedQuery.toLowerCase())}%`;
    clauses.push(`(${SEARCH_FIELDS.map((field) => `LOWER(COALESCE(${field}, '')) LIKE ? ESCAPE '\\'`).join(" OR ")})`);
    args.push(...SEARCH_FIELDS.map(() => pattern));
  }

  return { normalizedQuery, whereSql: clauses.join(" AND "), args };
}

export function buildExactMatchRankSql(query) {
  if (!query) return "0";
  return `CASE WHEN ${EXACT_IDENTIFIER_FIELDS.map((field) => `LOWER(COALESCE(${field}, '')) = ?`).join(" OR ")} THEN 0 ELSE 1 END`;
}

export function exactMatchRankArgs(query) {
  return query ? EXACT_IDENTIFIER_FIELDS.map(() => query.toLowerCase()) : [];
}

export function packageHistorySummaryFromRow(row) {
  return {
    id: Number(row.id),
    product_name: row.product_name || "Sin producto",
    sku: row.sku || null,
    tracking_number: row.tracking_number || null,
    sale_id: row.sale_id || null,
    external_order_id: row.external_order_id || null,
    external_shipment_id: row.external_shipment_id || null,
    status: row.status || "pendiente",
    carrier: row.carrier || "Sin asignar",
    dispatch_date: row.dispatch_date || null,
    created_at: row.created_at || null,
  };
}

export function packageHistoryDetailFromRow(row) {
  return {
    id: Number(row.id),
    sale_type: row.sale_type || null,
    sale_id: row.sale_id || null,
    tracking_number: row.tracking_number || null,
    remitente_id: row.remitente_id || null,
    external_provider: row.external_provider || null,
    external_order_id: row.external_order_id || null,
    external_shipment_id: row.external_shipment_id || null,
    product_name: row.product_name || "Sin producto",
    sku: row.sku || null,
    color: row.color || null,
    voltage: row.voltage || null,
    quantity: Number(row.quantity) || 1,
    recipient_name: row.recipient_name || null,
    recipient_user: row.recipient_user || null,
    recipient_phone: row.recipient_phone || null,
    address: row.address || null,
    postal_code: row.postal_code || null,
    city: row.city || null,
    partido: row.partido || null,
    province: row.province || null,
    reference: row.reference || null,
    shipping_method: row.shipping_method || null,
    carrier_code: row.carrier_code || null,
    carrier_name: row.carrier_name || null,
    assigned_carrier: row.assigned_carrier || null,
    carrier: row.carrier || "Sin asignar",
    status: row.status || "pendiente",
    dispatch_date: row.dispatch_date || null,
    delivery_date: row.delivery_date || null,
    created_at: row.created_at || null,
    batch: row.batch_id ? { id: Number(row.batch_id), date: row.batch_date || null, created_at: row.batch_created_at || null } : null,
  };
}
