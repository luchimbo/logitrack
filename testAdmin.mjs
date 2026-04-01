import Database from 'better-sqlite3';
const db = new Database('./data.db');
try {
    const users = db.prepare('SELECT * FROM users').all();
    console.log('USERS IN DB:', users);
} catch (e) {
    console.error('ERROR:', e.message);
}
