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

export async function downloadLabelZpl(shipmentId) {
    const response = await fetch(`/api/shipments/${shipmentId}/label`);
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Error al descargar");
    }
    const zpl = await response.text();
    const blob = new Blob([zpl], { type: "application/x-www-form-urlencoded" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `etiqueta-${shipmentId}.zpl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
