import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@libsql/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const BATCH_SIZE = 500;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Falta ${name} en .env.local`);
  }
  return value;
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function tableNameFromSql(sql) {
  const match = String(sql || "").match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([^\s(]+))/i);
  return match?.[1] || match?.[2] || match?.[3] || match?.[4] || "";
}

function triggerNameFromSql(sql) {
  const match = String(sql || "").match(/^CREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([^\s]+))/i);
  return match?.[1] || match?.[2] || match?.[3] || match?.[4] || "";
}

async function getObjects(db) {
  const result = await db.execute(`
    SELECT rowid, type, name, tbl_name, sql
    FROM sqlite_master
    WHERE sql IS NOT NULL
      AND name NOT LIKE 'sqlite_%'
    ORDER BY
      CASE type
        WHEN 'table' THEN 1
        WHEN 'index' THEN 2
        WHEN 'trigger' THEN 3
        WHEN 'view' THEN 4
        ELSE 5
      END,
      rowid
  `);

  return result.rows;
}

async function clearDestination(db) {
  const objects = await getObjects(db);
  const views = objects.filter((row) => row.type === "view");
  const triggers = objects.filter((row) => row.type === "trigger");
  const indexes = objects.filter((row) => row.type === "index");
  const tables = objects.filter((row) => row.type === "table");

  for (const row of views) {
    await db.execute(`DROP VIEW IF EXISTS ${quoteIdentifier(row.name)}`);
  }

  for (const row of triggers) {
    await db.execute(`DROP TRIGGER IF EXISTS ${quoteIdentifier(row.name)}`);
  }

  for (const row of indexes) {
    await db.execute(`DROP INDEX IF EXISTS ${quoteIdentifier(row.name)}`);
  }

  for (const row of tables.reverse()) {
    await db.execute(`DROP TABLE IF EXISTS ${quoteIdentifier(row.name)}`);
  }
}

async function createSchema(sourceDb, destinationDb) {
  const objects = await getObjects(sourceDb);
  const tables = objects.filter((row) => row.type === "table");
  const indexes = objects.filter((row) => row.type === "index");
  const triggers = objects.filter((row) => row.type === "trigger");
  const views = objects.filter((row) => row.type === "view");

  for (const row of tables) {
    await destinationDb.execute(row.sql);
  }

  return { tables, indexes, views, triggers };
}

async function copyTable(sourceDb, destinationDb, tableName) {
  const quotedTable = quoteIdentifier(tableName);
  const columnsResult = await sourceDb.execute(`PRAGMA table_info(${quotedTable})`);
  const columns = columnsResult.rows.map((row) => String(row.name));

  if (!columns.length) return 0;

  const quotedColumns = columns.map(quoteIdentifier).join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  const insertSql = `INSERT INTO ${quotedTable} (${quotedColumns}) VALUES (${placeholders})`;

  let copied = 0;
  let offset = 0;

  while (true) {
    const result = await sourceDb.execute({
      sql: `SELECT ${quotedColumns} FROM ${quotedTable} LIMIT ? OFFSET ?`,
      args: [BATCH_SIZE, offset],
    });

    if (!result.rows.length) break;

    try {
      await destinationDb.batch(
        result.rows.map((row) => ({
          sql: insertSql,
          args: columns.map((column) => row[column]),
        })),
        "write"
      );
    } catch (error) {
      throw new Error(`No se pudo copiar la tabla ${tableName}: ${error?.message || error}`);
    }

    copied += result.rows.length;
    offset += result.rows.length;
    process.stdout.write(`\r${tableName}: ${copied} filas copiadas`);
  }

  if (copied > 0) process.stdout.write("\n");
  return copied;
}

async function copySqliteSequence(sourceDb, destinationDb) {
  const exists = await sourceDb.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence' LIMIT 1");
  if (!exists.rows.length) return;

  const sequence = await sourceDb.execute("SELECT name, seq FROM sqlite_sequence");
  for (const row of sequence.rows) {
    await destinationDb.execute({
      sql: "UPDATE sqlite_sequence SET seq = ? WHERE name = ?",
      args: [row.seq, row.name],
    });
  }
}

async function main() {
  loadEnvFile(path.join(ROOT_DIR, ".env.local"));

  if (!process.argv.includes("--yes")) {
    console.error("Este script borra y reemplaza la base local. Ejecutalo con: npm run db:pull-prod:yes");
    process.exit(1);
  }

  const prodUrl = requiredEnv("TURSO_DATABASE_URL_PROD");
  const prodToken = requiredEnv("TURSO_AUTH_TOKEN_PROD");
  const localUrl = requiredEnv("TURSO_DATABASE_URL");
  const localToken = requiredEnv("TURSO_AUTH_TOKEN");

  if (prodUrl === localUrl) {
    throw new Error("TURSO_DATABASE_URL_PROD y TURSO_DATABASE_URL son iguales. No se puede continuar.");
  }

  const sourceDb = createClient({ url: prodUrl, authToken: prodToken });
  const destinationDb = createClient({ url: localUrl, authToken: localToken });

  console.log("Copiando base de produccion a local...");
  console.log("Borrando schema local...");
  await destinationDb.execute("PRAGMA foreign_keys = OFF");
  await clearDestination(destinationDb);

  console.log("Creando schema local...");
  const { tables, indexes, views, triggers } = await createSchema(sourceDb, destinationDb);

  console.log("Copiando datos...");
  let totalRows = 0;
  for (const row of tables) {
    const tableName = tableNameFromSql(row.sql) || row.name;
    totalRows += await copyTable(sourceDb, destinationDb, tableName);
  }

  await copySqliteSequence(sourceDb, destinationDb);

  for (const row of indexes) {
    await destinationDb.execute(row.sql);
  }

  for (const row of views) {
    await destinationDb.execute(row.sql);
  }

  for (const row of triggers) {
    const name = triggerNameFromSql(row.sql) || row.name;
    try {
      await destinationDb.execute(row.sql);
    } catch (error) {
      throw new Error(`No se pudo crear el trigger ${name}: ${error?.message || error}`);
    }
  }

  await destinationDb.execute("PRAGMA foreign_keys = ON");
  console.log(`Listo. ${tables.length} tablas copiadas, ${totalRows} filas copiadas.`);
}

main().catch((error) => {
  console.error("Error copiando la base:", error?.message || error);
  process.exit(1);
});
