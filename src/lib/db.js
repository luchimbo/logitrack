import { createClient } from "@libsql/client";

export const dbUrl = process.env.TURSO_DATABASE_URL;
export const dbAuthToken = process.env.TURSO_AUTH_TOKEN;
export const hasDbCredentials = Boolean(dbUrl && dbAuthToken);

if (!hasDbCredentials) {
    console.warn("⚠️ DATABASE CREDENTIALS NOT FOUND. Ensure TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set.");
}

export const db = createClient({
    url: dbUrl || "libsql://default-placeholder.turso.io",
    authToken: dbAuthToken || "dummy-token",
});
