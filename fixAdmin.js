import 'dotenv/config';
import { createClient } from "@libsql/client";
import bcrypt from 'bcryptjs';

(async () => {
    try {
        const dbUrl = process.env.TURSO_DATABASE_URL || "file:./data.db";
        const dbAuthToken = process.env.TURSO_AUTH_TOKEN;

        console.log("Conectando a DB:", dbUrl);

        const db = createClient({
            url: dbUrl,
            authToken: dbAuthToken,
        });

        // 1. Generate correct hash
        const correctHash = await bcrypt.hash("123456", 10);
        console.log("Nuevo Hash:", correctHash);

        // 2. Insert or replace admin
        const check = await db.execute("SELECT id FROM users WHERE username = 'admin'");
        if (check.rows.length === 0) {
            console.log("El usuario admin no existe. Creándolo por primera vez...");
            await db.execute({
                sql: "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                args: ['admin', correctHash]
            });
        } else {
            console.log("El usuario admin ya existe. Actualizando el hash...");
            await db.execute({
                sql: "UPDATE users SET password_hash = ? WHERE username = 'admin'",
                args: [correctHash]
            });
        }
        console.log("¡Éxito!");
    } catch (e) {
        console.error("Error:", e);
    }
})();
