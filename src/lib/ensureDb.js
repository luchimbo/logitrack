import { initDb } from "./dbInit";

let _dbReady = null;

// Call this before any DB query to ensure tables exist
export function ensureDb() {
    if (!_dbReady) {
        _dbReady = initDb().catch(e => {
            console.error("DB init failed:", e.message);
            _dbReady = null; // Allow retry on next call
        });
    }
    return _dbReady;
}
