import { createClient } from "@libsql/client";
import { databaseConfig } from './databaseConfig.js';

let client;

export function getReadOnlyDb() {
  if (!client) client = createClient(databaseConfig(process.env, { readOnly: true }));
  return client;
}
