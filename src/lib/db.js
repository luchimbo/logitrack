import { createClient } from "@libsql/client";
import { databaseConfig } from './databaseConfig.js';

export const dbUrl = process.env.DATABASE_URL;
export const dbAuthToken = process.env.DATABASE_AUTH_TOKEN;
export const hasDbCredentials = Boolean(dbUrl && dbAuthToken);

if (!hasDbCredentials) {
    console.warn("⚠️ Configurá DATABASE_URL y DATABASE_AUTH_TOKEN para libSQL de PC MIDI.");
}

// Next puede importar el módulo al compilar sin credenciales. El destino local
// permite esa importación sin abrir una conexión ni recurrir a otra base.
const dbConfig = hasDbCredentials ? databaseConfig() : { url: 'http://127.0.0.1:8088' };

export const db = createClient(dbConfig);
