// src/lib/dateUtils.js
// Computes SQL-friendly date ranges for period filtering

export function getDateRange(period, specificDate) {
    const now = new Date();
    // Format: YYYY-MM-DD
    const fmt = (d) => d.toISOString().slice(0, 10);

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

        default:
            return { from: fmt(now), to: fmt(now) };
    }
}
