import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPackageHistoryFilters,
  decodePackageHistoryCursor,
  encodePackageHistoryCursor,
  getPackageHistoryLimit,
  packageHistoryDetailFromRow,
  packageHistorySummaryFromRow,
} from "../src/lib/packageHistory.js";

test("package history searches every supported package identifier", () => {
  const filters = buildPackageHistoryFilters({ workspaceId: 7, query: "  SKU_50%  " });
  assert.equal(filters.normalizedQuery, "SKU_50%");
  assert.match(filters.whereSql, /s\.product_name/);
  assert.match(filters.whereSql, /s\.sku/);
  assert.match(filters.whereSql, /s\.tracking_number/);
  assert.match(filters.whereSql, /s\.sale_id/);
  assert.match(filters.whereSql, /s\.external_order_id/);
  assert.match(filters.whereSql, /s\.external_shipment_id/);
  assert.equal(filters.args[0], 7);
  assert.equal(filters.args[1], "%sku\\_50\\%%");
});

test("package history bounds page sizes and keeps an opaque cursor", () => {
  assert.equal(getPackageHistoryLimit(), 50);
  assert.equal(getPackageHistoryLimit("999"), 100);
  assert.equal(getPackageHistoryLimit("0"), 1);
  const cursor = encodePackageHistoryCursor({ rank: 1, id: 42 });
  assert.equal(cursor, "1:42");
  assert.deepEqual(decodePackageHistoryCursor(cursor), { rank: 1, id: 42 });
  assert.equal(decodePackageHistoryCursor("42"), null);
  assert.equal(decodePackageHistoryCursor("1:0"), null);
});

test("package summary applies safe carrier and missing-value fallbacks", () => {
  const summary = packageHistorySummaryFromRow({ id: "12", product_name: "", carrier: null, status: null });
  assert.equal(summary.id, 12);
  assert.equal(summary.product_name, "Sin producto");
  assert.equal(summary.carrier, "Sin asignar");
  assert.equal(summary.status, "pendiente");
});

test("package detail exposes operational data without raw label data", () => {
  const detail = packageHistoryDetailFromRow({
    id: "15", product_name: "Teclado", quantity: "2", carrier: "Correo", raw_zpl: "secret-label",
    batch_id: "4", batch_date: "2026-09-02",
  });
  assert.equal(detail.product_name, "Teclado");
  assert.equal(detail.quantity, 2);
  assert.deepEqual(detail.batch, { id: 4, date: "2026-09-02", created_at: null });
  assert.equal("raw_zpl" in detail, false);
});
