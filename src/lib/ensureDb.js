import { initDb } from "./dbInit";
import { hasDbCredentials } from "./db";
import { repairScheduleProductNames } from "./flexScheduleRepair";

let _dbReady = null;

// Call this before any DB query to ensure tables exist
export function ensureDb() {
    if (!hasDbCredentials) {
        return Promise.resolve(false);
    }

    if (!_dbReady) {
        _dbReady = initDb().then(async (result) => {
            // Corrige envíos Flex guardados con la franja "hasta las 21 hs" como producto.
            try {
                const fixed = await repairScheduleProductNames();
                if (fixed.shipments || fixed.printItems) console.info("Flex: productos con franja horaria corregidos", fixed);
            } catch (e) {
                console.error("Flex schedule repair failed:", e.message);
            }
            return result;
        }).catch(e => {
            console.error("DB init failed:", e.message);
            _dbReady = null; // Allow retry on next call
        });
    }
    return _dbReady;
}
