// Move only carriers already referenced by a workspace; never copy another workspace's private configuration.
// Caller controls the transaction and destination. A dry run never writes.
export async function migrateCarrierReferences(connection, { apply = false } = {}) {
  const rows = (await connection.execute(`SELECT DISTINCT refs.workspace_id, refs.carrier_id FROM (
    SELECT r.workspace_id, r.carrier_id FROM carrier_rates r
    UNION ALL SELECT l.workspace_id, l.carrier_id FROM carrier_settlements l
    UNION ALL SELECT f.workspace_id, CAST(json_extract(f.responsibility_json,'$.carrierId') AS INTEGER)
      FROM shipment_finance f WHERE json_valid(f.responsibility_json)
    UNION ALL SELECT s.workspace_id, c.id FROM shipments s JOIN carriers c ON c.workspace_id=0 AND c.name=s.assigned_carrier
      WHERE s.assigned_carrier IS NOT NULL AND s.assigned_carrier<>''
        AND NOT EXISTS (SELECT 1 FROM carriers own WHERE own.workspace_id=s.workspace_id AND own.name=c.name)
  ) refs JOIN workspaces w ON w.id=refs.workspace_id AND w.slug<>'legacy'
    JOIN carriers source ON source.id=refs.carrier_id AND source.workspace_id=0
    ORDER BY refs.workspace_id, refs.carrier_id`)).rows;
  const plan = [];
  for (const row of rows) {
    const workspaceId = Number(row.workspace_id), oldId = Number(row.carrier_id);
    const source = (await connection.execute({ sql:'SELECT id,name,display_name,color FROM carriers WHERE id=? AND workspace_id=0', args:[oldId] })).rows[0];
    if (plan.some(item => item.workspaceId === workspaceId && item.source.name === source.name && item.oldId !== oldId)) throw new Error(`Transportistas globales duplicados para el espacio ${workspaceId}`);
    const matches = (await connection.execute({ sql:'SELECT id FROM carriers WHERE workspace_id=? AND name=? ORDER BY id', args:[workspaceId,source.name] })).rows;
    if (matches.length > 1) throw new Error(`Transportistas duplicados en el espacio ${workspaceId}; resolver antes de migrar`);
    const closed = (await connection.execute({ sql:"SELECT count(*) AS n FROM carrier_settlements WHERE workspace_id=? AND carrier_id=? AND status<>'draft'", args:[workspaceId,oldId] })).rows[0];
    if (Number(closed.n)) throw new Error(`Hay liquidaciones cerradas en el espacio ${workspaceId}; requieren revisión específica`);
    plan.push({ workspaceId, oldId, newId: matches.length ? Number(matches[0].id) : null, source });
  }
  if (!apply) return plan;
  for (const item of plan) {
    let newId = item.newId;
    if (!newId) {
      const result = await connection.execute({ sql:'INSERT INTO carriers(workspace_id,name,display_name,color) VALUES(?,?,?,?)', args:[item.workspaceId,item.source.name,item.source.display_name,item.source.color] });
      newId = Number(result.lastInsertRowid);
    }
    // Uniqueness conflicts abort the enclosing transaction rather than overwrite existing prices.
    await connection.execute({ sql:'UPDATE carrier_rates SET carrier_id=? WHERE workspace_id=? AND carrier_id=?', args:[newId,item.workspaceId,item.oldId] });
    await connection.execute({ sql:"UPDATE carrier_settlements SET carrier_id=? WHERE workspace_id=? AND carrier_id=? AND status='draft'", args:[newId,item.workspaceId,item.oldId] });
    await connection.execute({ sql:"UPDATE shipment_finance SET responsibility_json=json_set(responsibility_json,'$.carrierId',?) WHERE workspace_id=? AND json_valid(responsibility_json) AND CAST(json_extract(responsibility_json,'$.carrierId') AS INTEGER)=?", args:[newId,item.workspaceId,item.oldId] });
    await connection.execute({ sql:'DELETE FROM finance_snapshot WHERE workspace_id=?', args:[item.workspaceId] });
    await connection.execute({ sql:'DELETE FROM finance_snapshot_meta WHERE workspace_id=?', args:[item.workspaceId] });
    await connection.execute({ sql:"INSERT INTO audit_logs(workspace_id,actor_type,action,entity_type,entity_id,metadata_json) VALUES(?,'system','carrier_scope_migration','carrier',?,?)", args:[item.workspaceId,String(newId),JSON.stringify({previousCarrierId:item.oldId})] });
    item.newId = newId;
  }
  return plan;
}
