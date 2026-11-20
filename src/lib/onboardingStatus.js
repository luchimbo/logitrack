export async function getOnboardingStatus(db, workspaceId, carrierScope) {
  const result = await db.execute({
    sql: `SELECT
      EXISTS(SELECT 1 FROM workspace_integration_connections WHERE workspace_id=? AND is_active=1)
        OR EXISTS(SELECT 1 FROM workspace_integrations WHERE workspace_id=? AND is_active=1) AS connected,
      EXISTS(SELECT 1 FROM shipments WHERE workspace_id=?) AS shipments,
      EXISTS(SELECT 1 FROM zone_mappings WHERE workspace_id=?) AS zones,
      EXISTS(SELECT 1 FROM shipments WHERE workspace_id=? AND raw_zpl IS NOT NULL AND raw_zpl<>'')
        OR EXISTS(SELECT 1 FROM mercadolibre_orders WHERE workspace_id=? AND printed_label_zpl IS NOT NULL AND printed_label_zpl<>'') AS labels`,
    args: [workspaceId,workspaceId,workspaceId,carrierScope,workspaceId,workspaceId],
  });
  const row = result.rows[0];
  return { connected:Boolean(row.connected), shipments:Boolean(row.shipments), zones:Boolean(row.zones), labels:Boolean(row.labels) };
}
