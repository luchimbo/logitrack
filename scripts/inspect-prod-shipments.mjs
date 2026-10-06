import { createClient } from "@libsql/client";
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const db = createClient({
  url: env.TURSO_DATABASE_URL_PROD,
  authToken: env.TURSO_AUTH_TOKEN_PROD,
});

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
