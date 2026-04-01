import { initDb } from './src/lib/dbInit.js';
(async () => {
    console.log("Forzando inicializacion de DB...");
    await initDb();
    const { db } = await import('./src/lib/db.js');
    const users = await db.execute("SELECT * FROM users");
    console.log("Usuarios en DB:", users.rows);
    process.exit(0);
})();
