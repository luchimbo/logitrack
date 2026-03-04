const fs = require('fs');
const existing = fs.readFileSync('src/app/globals.css', 'utf8');

const extra = `

/* Period Picker Tabs */
.period-picker{display:flex;align-items:center;gap:4px;background:var(--bg-secondary);border-radius:var(--radius-lg);padding:4px;border:1px solid var(--border)}
.period-tab{display:flex;align-items:center;gap:5px;padding:8px 14px;border:none;border-radius:var(--radius);background:transparent;color:var(--text-muted);font-size:12px;font-weight:600;font-family:var(--font);cursor:pointer;transition:all var(--duration) var(--ease);white-space:nowrap}
.period-tab:hover{background:var(--surface);color:var(--text)}
.period-tab.active{background:var(--accent-light);color:var(--accent);box-shadow:0 1px 4px rgba(0,0,0,0.2)}
.period-icon{font-size:14px}
.period-label{font-size:12px}
.date-input{width:140px;padding:7px 10px;font-size:12px;margin-left:4px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-family:var(--font);outline:none}
.date-input:focus{border-color:var(--border-focus);box-shadow:0 0 0 3px var(--accent-light)}
.date-input::-webkit-calendar-picker-indicator{filter:invert(1);opacity:0.6;cursor:pointer}
.nav-icon{font-size:16px;width:22px;text-align:center}
`;

fs.writeFileSync('src/app/globals.css', existing + extra, 'utf8');
console.log('CSS appended successfully');
