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

        case 'week': {
            const day = now.getDay(); // 0=Sun
            const monday = new Date(now);
            monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
            return { from: fmt(monday), to: fmt(now) };
        }

        case 'month': {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            return { from: fmt(firstDay), to: fmt(now) };
        }

        case 'year': {
            const jan1 = new Date(now.getFullYear(), 0, 1);
            return { from: fmt(jan1), to: fmt(now) };
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
