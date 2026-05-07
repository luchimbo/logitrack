import { createClient } from "@libsql/client";

export const dbUrl = process.env.TURSO_DATABASE_URL;
export const dbAuthToken = process.env.TURSO_AUTH_TOKEN;
export const hasDbCredentials = Boolean(dbUrl && dbAuthToken);

if (!hasDbCredentials) {
    console.warn("⚠️ DATABASE CREDENTIALS NOT FOUND. Ensure TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set.");
}

const dbConfig = { url: dbUrl || "libsql://default-placeholder.turso.io" };

if (dbAuthToken) {
    dbConfig.authToken = dbAuthToken;
}

export const db = createClient(dbConfig);
