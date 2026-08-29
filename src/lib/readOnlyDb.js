import { createClient } from "@libsql/client";

let client;

export function getReadOnlyDb() {
  const url = String(process.env.TURSO_DATABASE_URL || "").trim();
  // El token de solo lectura protege producción. En desarrollo local puede no
  // estar emitido para la base de prueba, por lo que se usa el token normal.
  const configuredToken = process.env.NODE_ENV === "development"
    ? (process.env.TURSO_AUTH_TOKEN || process.env.TURSO_READONLY_AUTH_TOKEN)
    : process.env.TURSO_READONLY_AUTH_TOKEN;
  const authToken = String(configuredToken || "").trim();
  if (!url || !authToken) {
    throw new Error("El portal externo requiere TURSO_DATABASE_URL y TURSO_READONLY_AUTH_TOKEN");
  }
  if (!client) client = createClient({ url, authToken });
  return client;
}
