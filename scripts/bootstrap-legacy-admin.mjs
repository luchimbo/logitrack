import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import { createClient } from "@libsql/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

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

function parseArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return "";
  return String(process.argv[index + 1] || "").trim();
}

async function ensureLegacyUsersTable(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const tableInfo = await db.execute("PRAGMA table_info(users)");
  const cols = tableInfo.rows.map((row) => row.name);
  if (!cols.includes("role")) {
    await db.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  }
}

async function main() {
  loadEnvFile(path.join(ROOT_DIR, ".env.local"));

  const dbUrl = String(process.env.TURSO_DATABASE_URL || "").trim();
  const dbAuthToken = String(process.env.TURSO_AUTH_TOKEN || "").trim();
  const username = parseArgValue("--username") || String(process.env.LEGACY_ADMIN_USERNAME || "").trim();
  const password = parseArgValue("--password") || String(process.env.LEGACY_ADMIN_PASSWORD || "").trim();

  if (!dbUrl || !dbAuthToken) {
    console.error("Faltan TURSO_DATABASE_URL o TURSO_AUTH_TOKEN.");
    process.exit(1);
  }

  if (!username || !password) {
    console.error("Uso: node scripts/bootstrap-legacy-admin.mjs --username <usuario> --password <clave>");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("La contraseña debe tener al menos 8 caracteres.");
    process.exit(1);
  }

  const db = createClient({ url: dbUrl, authToken: dbAuthToken });
  await ensureLegacyUsersTable(db);

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await db.execute({
    sql: "SELECT id FROM users WHERE username = ? LIMIT 1",
    args: [username],
  });

  if (existing.rows.length) {
    await db.execute({
      sql: "UPDATE users SET password_hash = ?, role = ? WHERE id = ?",
      args: [passwordHash, "admin", existing.rows[0].id],
    });
    console.log(`Admin legacy actualizado: ${username}`);
    return;
  }

  await db.execute({
    sql: "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
    args: [username, passwordHash, "admin"],
  });
  console.log(`Admin legacy creado: ${username}`);
}

main().catch((error) => {
  console.error("Bootstrap legacy admin error:", error?.message || error);
  process.exit(1);
});
