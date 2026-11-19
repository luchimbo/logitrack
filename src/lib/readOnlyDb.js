import { createClient } from "@libsql/client";
import { databaseConfig } from './databaseConfig.js';

let client;

export function getReadOnlyDb() {
  if (process.env.GEOMODI_SANDBOX === "1") throw new Error("El portal externo no está disponible en el entorno de prueba local");
  if (!client) client = createClient(databaseConfig(process.env, { readOnly: true }));
  return client;
}
