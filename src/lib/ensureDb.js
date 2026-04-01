import { initDb } from "./dbInit";
import { hasDbCredentials } from "./db";

let _dbReady = null;

// Call this before any DB query to ensure tables exist
export function ensureDb() {
    if (!hasDbCredentials) {
        return Promise.resolve(false);
    }

    if (!_dbReady) {
        _dbReady = initDb().catch(e => {
            console.error("DB init failed:", e.message);
            _dbReady = null; // Allow retry on next call
        });
    }
    return _dbReady;
}
