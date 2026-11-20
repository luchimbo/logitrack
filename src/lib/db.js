import { createClient } from "@libsql/client";
import { databaseConfig } from './databaseConfig.js';

export const dbUrl = process.env.DATABASE_URL;
export const dbAuthToken = process.env.DATABASE_AUTH_TOKEN;
export const hasDbCredentials = Boolean(dbUrl && dbAuthToken);

if (!hasDbCredentials) {
    console.warn("⚠️ Configurá DATABASE_URL y DATABASE_AUTH_TOKEN para libSQL de PC MIDI.");
}

// Cliente que no abre conexión: cada consulta devuelve el error de configuración.
function blockedClient(error) {
    const fail = () => Promise.reject(error);
    return new Proxy({}, { get: (_, key) => (key === 'then' ? undefined : key === 'close' ? () => {} : fail) });
}

// Next importa este módulo al compilar ("Collecting page data"). Un Preview
// configurado con la base operativa no debe tocarla, pero tampoco tiene que
// romper el build: queda compilado y cada consulta falla con el motivo.
export function createDatabaseClient(env = process.env, create = createClient) {
    const hasCredentials = Boolean(env.DATABASE_URL && env.DATABASE_AUTH_TOKEN);
    if (!hasCredentials) {
        // Next puede importar el módulo al compilar sin credenciales. El destino local
        // permite esa importación sin abrir una conexión ni recurrir a otra base.
        return create({ url: 'http://127.0.0.1:8088' });
    }
    try {
        return create(databaseConfig(env));
    } catch (error) {
        if (env.VERCEL_ENV === 'preview') {
            console.error(`⚠️ ${error.message}`);
            return blockedClient(error);
        }
        throw error;
    }
}

export const db = createDatabaseClient();
