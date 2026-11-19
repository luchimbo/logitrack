// src/lib/api.js
import { friendlyNetworkError, messageForStatus } from './apiErrors.js';

export async function api(path, options = {}) {
    let res;
    try {
        res = await fetch(`/api${path}`, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options,
        });
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw friendlyNetworkError(error);
    }

    if (!res.ok) {
        let err;
        try {
            err = await res.json();
        } catch (e) {
            err = {};
        }
        throw new Error(messageForStatus(res.status, err.detail || err.error));
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

export async function downloadLabelsZpl(shipmentIds) {
    const ids = Array.isArray(shipmentIds) ? shipmentIds.filter(Boolean) : [];
    if (!ids.length) return;

    const response = await fetch('/api/shipments/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Error al descargar etiquetas');
    }

    const zpl = await response.text();
    const blob = new Blob([zpl], { type: 'application/vnd.zebra-zpl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etiquetas-${new Date().toISOString().slice(0, 10)}.zpl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function toast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return; // Fallback if container not rendered yet

    const text = String(message ?? '');
    // Los refrescos automáticos repiten el mismo error: no apilar avisos idénticos.
    if (Array.from(container.children).some((child) => child.dataset.message === text)) return;

    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.dataset.message = text;
    const icon = document.createElement('span');
    icon.textContent = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    const body = document.createElement('span');
    body.textContent = text; // textContent: el mensaje puede venir del servidor
    el.append(icon, body);
    container.appendChild(el);
    setTimeout(() => el.remove(), duration);
}
