import { productionDatabaseConfig } from './database-env.mjs';
import { createClient } from "@libsql/client";
const db = createClient(productionDatabaseConfig({ readOnly: true }));

const cols = await db.execute("PRAGMA table_info(shipments)");
console.log("=== columnas shipments ===");
for (const c of cols.rows) console.log(`${c.name}\t${c.type}\t${c.notnull ? "NOT NULL" : ""}${c.dflt_value ? " def=" + c.dflt_value : ""}`);

const ws = await db.execute("SELECT id, name, slug FROM workspaces ORDER BY id");
console.log("\n=== workspaces ===");
for (const w of ws.rows) console.log(`${w.id}\t${w.slug}\t${w.name}`);

const wp = await db.execute("SELECT workspace_id, workspace_key FROM workspace_printers");
console.log("\n=== workspace_printers (key -> workspace) ===");
for (const r of wp.rows) console.log(`${r.workspace_key}\t-> ws ${r.workspace_id}`);

const cnt = await db.execute("SELECT workspace_id, COUNT(*) n FROM shipments GROUP BY workspace_id");
console.log("\n=== shipments por workspace ===");
for (const r of cnt.rows) console.log(`ws ${r.workspace_id}: ${r.n}`);
