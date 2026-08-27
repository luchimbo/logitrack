import { createClient } from "@libsql/client";

let client;

export function getReadOnlyDb() {
  const url = String(process.env.TURSO_DATABASE_URL || "").trim();
  const authToken = String(process.env.TURSO_READONLY_AUTH_TOKEN || "").trim();
  if (!url || !authToken) {
    throw new Error("El portal externo requiere TURSO_DATABASE_URL y TURSO_READONLY_AUTH_TOKEN");
  }
  if (!client) client = createClient({ url, authToken });
  return client;
}
