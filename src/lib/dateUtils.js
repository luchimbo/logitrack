// src/lib/dateUtils.js
// Computes SQL-friendly date ranges for period filtering.

export const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires';

function parseDateValue(value) {
    if (value instanceof Date) return value;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        return new Date(`${value.trim()}T12:00:00Z`);
    }
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value.trim())) {
        return new Date(`${value.trim().replace(' ', 'T')}Z`);
    }
    return new Date(value);
}

export function getArgentinaDateString(value = new Date()) {
    const date = parseDateValue(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-CA', { timeZone: ARGENTINA_TIME_ZONE });
}

export function formatArgentinaDate(value, options = {}) {
    const date = parseDateValue(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('es-AR', {
        timeZone: ARGENTINA_TIME_ZONE,
        ...options,
    });
}

export function formatArgentinaDateTime(value, options = {}) {
    const date = parseDateValue(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('es-AR', {
        timeZone: ARGENTINA_TIME_ZONE,
        ...options,
    });
}

export function getDateRange(period, specificDate, fromDate, toDate) {
    const now = new Date();
    // Format: YYYY-MM-DD
    const fmt = getArgentinaDateString;

    switch (period) {
        case 'today':
            return { from: fmt(now), to: fmt(now) };

        case 'date':
            // specificDate should be "YYYY-MM-DD"
            if (specificDate) {
                return { from: specificDate, to: specificDate };
            }
            return { from: fmt(now), to: fmt(now) };

        // Los inicios de semana, mes y año salen del día de hoy en Argentina, no del reloj
        // del servidor (UTC en Vercel), para no arrancar un día antes.
        case 'week': {
            const today = fmt(now);
            const noon = new Date(`${today}T12:00:00Z`);
            const day = noon.getUTCDay(); // 0=Sun
            noon.setUTCDate(noon.getUTCDate() - (day === 0 ? 6 : day - 1));
            return { from: noon.toISOString().slice(0, 10), to: today };
        }

        case 'month': {
            const today = fmt(now);
            return { from: `${today.slice(0, 7)}-01`, to: today };
        }

        case 'year': {
            const today = fmt(now);
            return { from: `${today.slice(0, 4)}-01-01`, to: today };
        }

        case 'all':
            return { from: '2000-01-01', to: '2099-12-31' };

        case 'range': {
            const safeFrom = fromDate || toDate || fmt(now);
            const safeTo = toDate || fromDate || fmt(now);
            if (safeFrom <= safeTo) {
                return { from: safeFrom, to: safeTo };
            }
            return { from: safeTo, to: safeFrom };
        }

        default:
            return { from: fmt(now), to: fmt(now) };
    }
}
