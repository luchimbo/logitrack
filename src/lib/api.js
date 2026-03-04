// src/lib/api.js

export async function api(path, options = {}) {
    const res = await fetch(`/api${path}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
    });

    if (!res.ok) {
        let err;
        try {
            err = await res.json();
        } catch (e) {
            err = { detail: 'Error de servidor' };
        }
        throw new Error(err.detail || err.error || `Error ${res.status}`);
    }
    return res.json();
}

export function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return; // Fallback if container not rendered yet

    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span><span>${message}</span>`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
}
