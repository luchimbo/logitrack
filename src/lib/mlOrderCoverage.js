// Which days of a Mercado Libre account's orders were already listed completely. A later settlement only searches the
// days outside that range; inside it, the stored orders are trusted and only the open ones are refreshed.
import { db } from '@/lib/db';
import { getArgentinaDateString } from '@/lib/dateUtils';
import { mergeCoverage, planOrderSearch } from '@/lib/logisticsFinance';

export { planOrderSearch };
const execute = (sql, args = []) => db.execute({ sql, args });

export async function readCoverage(connectionId) {
  const row = (await execute('SELECT covered_from, covered_to FROM ml_order_coverage WHERE integration_connection_id=?', [Number(connectionId)])).rows[0];
  return row ? { from: String(row.covered_from), to: String(row.covered_to) } : null;
}

export async function saveCoverage(workspaceId, connectionId, from, to) {
  const next = mergeCoverage(await readCoverage(connectionId), from, to, getArgentinaDateString());
  if (!next) return null;
  await execute(`INSERT INTO ml_order_coverage(integration_connection_id, workspace_id, covered_from, covered_to, updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(integration_connection_id) DO UPDATE SET covered_from=excluded.covered_from, covered_to=excluded.covered_to, updated_at=CURRENT_TIMESTAMP`,
  [Number(connectionId), workspaceId, next.from, next.to]);
  return next;
}
